"""Map configured IR codes to optimistic Home Assistant light entities."""

import asyncio
import base64
import binascii
import math
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


def ir_code(value: Any) -> str | dict[str, str]:
    """Validate raw or explicitly prefixed base64, retaining existing YAML values."""
    if isinstance(value, dict):
        return vol.Schema(
            {
                vol.Required("device"): vol.All(cv.string, vol.Length(min=1)),
                vol.Required("command"): vol.All(cv.string, vol.Length(min=1)),
            }
        )(value)
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
        vol.Optional("brightness_steps"): vol.All(
            vol.Coerce(int), vol.Range(min=1, max=100)
        ),
    }
)


async def async_setup_platform(
    hass: HomeAssistant,
    config: ConfigType,
    async_add_entities: AddEntitiesCallback,
    discovery_info: DiscoveryInfoType | None = None,
) -> None:
    """Set up lights from the existing YAML platform."""
    from .frontend import async_register_frontend

    await async_register_frontend(hass)
    _add_entities(config, async_add_entities)


async def async_setup_entry(hass, entry, async_add_entities):
    definition = {**entry.data, **entry.options}
    definition.pop("learned_device", None)
    config = PLATFORM_SCHEMA({"platform": "broadlink_ir_mapper", **definition})
    _add_entities(config, async_add_entities, entry)


def _add_entities(config, async_add_entities, entry=None):
    from homeassistant.helpers import entity_platform

    platform = entity_platform.async_get_current_platform()
    platform.async_register_entity_service("resynchronize", {}, "async_resynchronize")
    entity = BroadLinkIRLight(config)
    if entry is not None:
        entity._attr_device_info = {
            "identifiers": {("broadlink_ir_mapper", config["unique_id"])},
            "name": config["name"],
            "model": "IR light",
        }
    async_add_entities([entity])


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
        self._brightness_step = (
            255 / config["brightness_steps"] if "brightness_steps" in config else 25
        )
        self._last_error = None

    @property
    def extra_state_attributes(self):
        return {
            "ir_mapper": True,
            "ir_remote": self._remote,
            "ir_colors": [
                {"name": c[CONF_NAME], "rgb": c["rgb"]} for c in self._colors
            ],
            "ir_dimmable": self._dimmable,
            "ir_brightness_steps": round(255 / self._brightness_step),
            "ir_can_resynchronize": "brightness_up" in self._codes,
            "ir_last_error": self._last_error,
        }

    async def async_resynchronize(self):
        """Saturate brightness upward to establish a known full-brightness baseline."""
        async with self._command_lock:
            if "brightness_up" not in self._codes:
                raise ServiceValidationError(
                    "Learn brightness up before resynchronizing"
                )
            try:
                await self._send_ir_command(self._codes["power_on"])
                self._attr_is_on = True
                for _ in range(math.ceil(255 / self._brightness_step)):
                    await self._send_ir_command(self._codes["brightness_up"])
                self._attr_brightness = 255
            finally:
                self.async_write_ha_state()

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
            math.ceil(difference / self._brightness_step)
            if target in (1, 255)
            else round(difference / self._brightness_step)
        )
        code = self._codes["brightness_up" if direction > 0 else "brightness_down"]
        for _ in range(steps):
            await self._send_ir_command(code)
            self._attr_brightness = max(
                1,
                min(
                    255,
                    round(self._attr_brightness + direction * self._brightness_step),
                ),
            )

    async def _send_ir_command(self, code: str | dict[str, str]) -> None:
        try:
            state = self.hass.states.get(self._remote)
            if state is None or state.state in (
                STATE_UNAVAILABLE,
                STATE_UNKNOWN,
                "off",
            ):
                raise HomeAssistantError(
                    f"BroadLink remote {self._remote} is unavailable"
                )
            payload = (
                code
                if isinstance(code, dict)
                else {"command": f"b64:{code.removeprefix('b64:')}"}
            )
            await self.hass.services.async_call(
                "remote",
                "send_command",
                {"entity_id": self._remote, **payload},
                blocking=True,
                context=self._context,
            )
        except (HomeAssistantError, ValueError, OSError) as err:
            self._last_error = str(err)
            raise HomeAssistantError(str(err)) from err
        else:
            self._last_error = None
