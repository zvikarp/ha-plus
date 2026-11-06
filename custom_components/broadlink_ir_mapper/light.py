"""Map configured IR codes to optimistic Home Assistant light entities."""

import asyncio
import base64
import binascii
from typing import Any

import voluptuous as vol
from homeassistant.components.light import (
    ATTR_BRIGHTNESS,
    ATTR_EFFECT,
    ATTR_RGB_COLOR,
    ColorMode,
    LightEntity,
    LightEntityFeature,
)
from homeassistant.components.light import (
    PLATFORM_SCHEMA as LIGHT_PLATFORM_SCHEMA,
)
from homeassistant.const import (
    CONF_NAME,
    CONF_UNIQUE_ID,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
)
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.typing import ConfigType, DiscoveryInfoType


def ir_code(value: Any) -> str:
    """Validate raw or explicitly prefixed base64, retaining existing YAML values."""
    value = cv.string(value).strip()
    raw = value.removeprefix("b64:")
    try:
        if not base64.b64decode(raw, validate=True):
            raise vol.Invalid("IR code must not be empty")
    except (ValueError, binascii.Error) as err:
        raise vol.Invalid("IR code must contain valid base64") from err
    return value


COLOR_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_NAME): cv.string,
        vol.Required("rgb"): vol.ExactSequence([cv.byte, cv.byte, cv.byte]),
        vol.Required("ir_code"): ir_code,
    }
)
EFFECT_SCHEMA = vol.Schema(
    {vol.Required(CONF_NAME): cv.string, vol.Required("ir_code"): ir_code}
)
PLATFORM_SCHEMA = LIGHT_PLATFORM_SCHEMA.extend(
    {
        vol.Required(CONF_NAME): cv.string,
        vol.Required("broadlink_remote"): cv.entity_domain("remote"),
        vol.Required("ir_codes"): vol.Schema(
            {
                vol.Required("power_on"): ir_code,
                vol.Required("power_off"): ir_code,
                vol.Optional("brightness_up"): ir_code,
                vol.Optional("brightness_down"): ir_code,
            }
        ),
        vol.Optional("colors", default=[]): vol.All(cv.ensure_list, [COLOR_SCHEMA]),
        vol.Optional("effects", default=[]): vol.All(cv.ensure_list, [EFFECT_SCHEMA]),
        vol.Optional(CONF_UNIQUE_ID): cv.string,
    }
)


async def async_setup_platform(
    hass: HomeAssistant,
    config: ConfigType,
    async_add_entities: AddEntitiesCallback,
    discovery_info: DiscoveryInfoType | None = None,
) -> None:
    """Set up lights from the existing YAML platform."""
    async_add_entities([BroadLinkIRLight(config)])


class BroadLinkIRLight(LightEntity):
    """An optimistic light; IR does not provide physical state feedback."""

    _attr_should_poll = False
    _attr_assumed_state = True
    _attr_is_on = False

    def __init__(self, config: ConfigType) -> None:
        self._attr_name = config[CONF_NAME]
        self._attr_unique_id = config.get(CONF_UNIQUE_ID)
        self._remote = config["broadlink_remote"]
        self._codes = config["ir_codes"]
        self._colors = config["colors"]
        self._effects = {
            effect[CONF_NAME]: effect["ir_code"] for effect in config["effects"]
        }
        self._attr_effect_list = list(self._effects)
        self._attr_supported_features = (
            LightEntityFeature.EFFECT if self._effects else LightEntityFeature(0)
        )
        self._dimmable = any(
            key in self._codes for key in ("brightness_up", "brightness_down")
        )
        mode = (
            ColorMode.RGB
            if self._colors
            else (ColorMode.BRIGHTNESS if self._dimmable else ColorMode.ONOFF)
        )
        self._attr_supported_color_modes = {mode}
        self._attr_color_mode = mode
        self._attr_brightness = 255 if mode != ColorMode.ONOFF else None
        self._attr_rgb_color = tuple(self._colors[0]["rgb"]) if self._colors else None
        self._attr_effect = None
        self._command_lock = asyncio.Lock()

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Send commands in order and expose only successfully submitted changes."""
        async with self._command_lock:
            effect = kwargs.get(ATTR_EFFECT)
            if effect is not None and effect not in self._effects:
                raise ServiceValidationError(f"Unknown IR effect: {effect}")
            brightness = kwargs.get(ATTR_BRIGHTNESS)
            if brightness is not None and not 0 <= brightness <= 255:
                raise ServiceValidationError("Brightness must be between 0 and 255")
            # RGB color mode implies brightness support in HA. Reject dimming
            # explicitly when a fixed-brightness RGB remote cannot perform it.
            if brightness not in (None, 0, self._attr_brightness):
                direction = (
                    "brightness_up"
                    if brightness > (self._attr_brightness or 0)
                    else "brightness_down"
                )
                if direction not in self._codes:
                    raise ServiceValidationError(
                        f"IR code {direction} is not configured"
                    )
            try:
                if brightness == 0:
                    await self._turn_off()
                    return
                if not self._attr_is_on:
                    await self._send_ir_command(self._codes["power_on"])
                    self._attr_is_on = True
                if brightness is not None and self._dimmable:
                    await self._set_brightness(brightness)
                if ATTR_RGB_COLOR in kwargs and self._colors:
                    rgb = kwargs[ATTR_RGB_COLOR]
                    color = min(
                        self._colors,
                        key=lambda c: sum((a - b) ** 2 for a, b in zip(rgb, c["rgb"])),
                    )
                    await self._send_ir_command(color["ir_code"])
                    self._attr_rgb_color = tuple(color["rgb"])
                    self._attr_effect = None
                if effect is not None:
                    await self._send_ir_command(self._effects[effect])
                    self._attr_effect = effect
            finally:
                self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        async with self._command_lock:
            try:
                await self._turn_off()
            finally:
                self.async_write_ha_state()

    async def _turn_off(self) -> None:
        await self._send_ir_command(self._codes["power_off"])
        self._attr_is_on = False
        self._attr_effect = None

    async def _set_brightness(self, target: int) -> None:
        """Estimate relative brightness in 25-point steps, bounded to 1..255 while on."""
        current = self._attr_brightness
        if target == current:
            return
        direction = 1 if target > current else -1
        # Ignore sub-half-step differences without changing the estimate. This
        # keeps repeated absolute targets from oscillating around a 25-point step.
        difference = abs(target - current)
        steps = (
            (difference + 24) // 25 if target in (1, 255) else round(difference / 25)
        )
        code = self._codes["brightness_up" if direction > 0 else "brightness_down"]
        for _ in range(steps):
            await self._send_ir_command(code)
            self._attr_brightness = max(
                1, min(255, self._attr_brightness + direction * 25)
            )

    async def _send_ir_command(self, code: str) -> None:
        state = self.hass.states.get(self._remote)
        if state is None or state.state in (STATE_UNAVAILABLE, STATE_UNKNOWN, "off"):
            raise HomeAssistantError(f"BroadLink remote {self._remote} is unavailable")
        await self.hass.services.async_call(
            "remote",
            "send_command",
            {"entity_id": self._remote, "command": f"b64:{code.removeprefix('b64:')}"},
            blocking=True,
            context=self._context,
        )
