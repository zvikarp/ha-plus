"""Native setup, background IR learning, command testing, and calibration."""

import asyncio
from copy import deepcopy
from uuid import uuid4

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import selector
from homeassistant.util import slugify

from . import DOMAIN
from .light import PLATFORM_SCHEMA


class DeviceEditor:
    """One editor shared by setup and options, with staged changes until Save."""

    _definition = None
    _learn_task = None
    _pending = None
    _error = None

    async def _basics(self, step_id, user_input, defaults):
        errors = {}
        if user_input is not None:
            definition = {**defaults, **user_input}
            remote = self.hass.states.get(definition["broadlink_remote"])
            if not definition["name"].strip():
                errors["name"] = "required"
            elif (
                not definition["broadlink_remote"].startswith("remote.")
                or remote is None
                or remote.state in ("off", "unavailable", "unknown")
            ):
                errors["broadlink_remote"] = "remote_unavailable"
            else:
                definition["name"] = definition["name"].strip()
                self._definition = definition
                return await self.async_step_settings()
        fields = {vol.Required("name", default=defaults.get("name", "")): str}
        # Learned commands belong to a specific remote. Options can rename and
        # recalibrate it; selecting another remote requires a new integration.
        if not defaults:
            fields[vol.Required("broadlink_remote")] = selector.EntitySelector(
                selector.EntitySelectorConfig(domain="remote", integration="broadlink")
            )
        fields[
            vol.Required(
                "brightness_steps", default=defaults.get("brightness_steps", 10)
            )
        ] = selector.NumberSelector(
            selector.NumberSelectorConfig(
                min=1, max=100, step=1, mode=selector.NumberSelectorMode.BOX
            )
        )
        return self.async_show_form(
            step_id=step_id, data_schema=vol.Schema(fields), errors=errors
        )

    async def async_step_settings(self, user_input=None):
        return self.async_show_menu(
            step_id="settings", menu_options=["learn", "test", "remove", "finish"]
        )

    async def async_step_learn(self, user_input=None):
        errors = {}
        if user_input is not None:
            kind = user_input["kind"]
            name = user_input.get("name", "").strip()
            if kind in ("color", "effect") and not name:
                errors["name"] = "required"
            else:
                self._pending = {
                    **user_input,
                    "name": name,
                    "ref": {
                        "device": self._definition["learned_device"],
                        "command": slugify(name or kind) + "_" + uuid4().hex,
                    },
                }
                self._error = None
                self._learn_task = self.hass.async_create_task(self._learn())
                return await self.async_step_learning()
        return self.async_show_form(
            step_id="learn",
            errors=errors,
            data_schema=vol.Schema(
                {
                    vol.Required("kind", default="power_on"): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=[
                                {"value": k, "label": v}
                                for k, v in [
                                    ("power_on", "Power on"),
                                    ("power_off", "Power off"),
                                    ("brightness_up", "Brightness up"),
                                    ("brightness_down", "Brightness down"),
                                    ("color", "Color preset"),
                                    ("effect", "Effect"),
                                ]
                            ]
                        )
                    ),
                    vol.Optional("name", default=""): str,
                    vol.Optional(
                        "rgb", default=[255, 0, 0]
                    ): selector.ColorRGBSelector(),
                }
            ),
        )

    async def _learn(self):
        try:
            async with asyncio.timeout(65):
                await self.hass.services.async_call(
                    "remote",
                    "learn_command",
                    {
                        "entity_id": self._definition["broadlink_remote"],
                        **self._pending["ref"],
                        "command_type": "ir",
                    },
                    blocking=True,
                )
                # BroadLink can log a learning failure without raising. Sending
                # the new reference verifies that a stored command actually exists.
                await self.hass.services.async_call(
                    "remote",
                    "send_command",
                    {
                        "entity_id": self._definition["broadlink_remote"],
                        **self._pending["ref"],
                    },
                    blocking=True,
                )
        except (HomeAssistantError, TimeoutError, ValueError, OSError):
            self._error = "learn_failed"

    async def async_step_learning(self, user_input=None):
        if not self._learn_task.done():
            return self.async_show_progress(
                step_id="learning",
                progress_action="learning",
                progress_task=self._learn_task,
            )
        return self.async_show_progress_done(next_step_id="learned")

    async def async_step_learned(self, user_input=None):
        if user_input is not None and "kind" in user_input:
            user_input = None
        if self._error:
            return (
                self.async_show_form(
                    step_id="learned",
                    errors={"base": self._error},
                    data_schema=vol.Schema({}),
                )
                if user_input is None
                else await self.async_step_learn()
            )
        if user_input is not None and not user_input["received"]:
            return self.async_show_form(
                step_id="learned",
                errors={"base": "not_confirmed"},
                data_schema=vol.Schema({vol.Required("received", default=False): bool}),
            )
        if user_input is not None:
            pending = self._pending
            kind = pending["kind"]
            if kind in ("color", "effect"):
                key = "colors" if kind == "color" else "effects"
                item = {"name": pending["name"], "ir_code": pending["ref"]}
                if kind == "color":
                    item["rgb"] = pending["rgb"]
                self._definition[key] = [
                    c for c in self._definition[key] if c["name"] != item["name"]
                ] + [item]
            else:
                self._definition["ir_codes"][kind] = pending["ref"]
            return await self.async_step_settings()
        return self.async_show_form(
            step_id="learned",
            data_schema=vol.Schema({vol.Required("received", default=False): bool}),
        )

    def _commands(self):
        return [
            (f"power:{k}", k.replace("_", " ").title(), v)
            for k, v in self._definition["ir_codes"].items()
        ] + [
            (f"{key}:{i}", c["name"], c["ir_code"])
            for key in ("colors", "effects")
            for i, c in enumerate(self._definition[key])
        ]

    async def async_step_test(self, user_input=None):
        errors = {}
        commands = self._commands()
        if not commands:
            return (
                self.async_show_form(
                    step_id="test",
                    errors={"base": "no_commands"},
                    data_schema=vol.Schema({}),
                )
                if user_input is None
                else await self.async_step_settings()
            )
        if user_input is not None:
            code = next(
                (c for key, _, c in commands if key == user_input["command"]), None
            )
            if code is None:
                errors["base"] = "test_failed"
            else:
                payload = (
                    code
                    if isinstance(code, dict)
                    else {"command": "b64:" + code.removeprefix("b64:")}
                )
                try:
                    await self.hass.services.async_call(
                        "remote",
                        "send_command",
                        {"entity_id": self._definition["broadlink_remote"], **payload},
                        blocking=True,
                    )
                except (HomeAssistantError, ValueError, OSError):
                    errors["base"] = "test_failed"
                else:
                    return await self.async_step_settings()
        return self.async_show_form(
            step_id="test",
            errors=errors,
            data_schema=vol.Schema(
                {
                    vol.Required("command"): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=[
                                {"value": key, "label": label}
                                for key, label, _ in commands
                            ]
                        )
                    )
                }
            ),
        )

    async def async_step_remove(self, user_input=None):
        commands = self._commands()
        if not commands:
            return await self.async_step_settings()
        if user_input is not None:
            key, name = user_input["command"].split(":", 1)
            if key == "power":
                self._definition["ir_codes"].pop(name, None)
            else:
                self._definition[key].pop(int(name))
            return await self.async_step_settings()
        return self.async_show_form(
            step_id="remove",
            data_schema=vol.Schema(
                {
                    vol.Required("command"): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=[
                                {"value": key, "label": label}
                                for key, label, _ in commands
                            ]
                        )
                    )
                }
            ),
        )

    async def async_step_finish(self, user_input=None):
        if not all(
            k in self._definition["ir_codes"] for k in ("power_on", "power_off")
        ):
            return (
                self.async_show_form(
                    step_id="finish",
                    errors={"base": "missing_power"},
                    data_schema=vol.Schema({}),
                )
                if user_input is None
                else await self.async_step_settings()
            )
        data = dict(self._definition)
        learned_device = data.pop("learned_device")
        data = PLATFORM_SCHEMA({"platform": DOMAIN, **data})
        data.pop("platform", None)
        data["learned_device"] = learned_device
        return self._save(data)


class IRConfigFlow(DeviceEditor, config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        result = await self._basics("user", user_input, {})
        if self._definition is not None and "ir_codes" not in self._definition:
            self._definition.update(
                unique_id=uuid4().hex,
                learned_device="ha_plus_ir_" + uuid4().hex,
                ir_codes={},
                colors=[],
                effects=[],
            )
        return result

    def _save(self, data):
        return self.async_create_entry(title=data["name"], data=data)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return IROptionsFlow(config_entry)


class IROptionsFlow(DeviceEditor, config_entries.OptionsFlow):
    def __init__(self, entry):
        self._entry = entry

    async def async_step_init(self, user_input=None):
        return await self._basics(
            "init", user_input, deepcopy({**self._entry.data, **self._entry.options})
        )

    def _save(self, data):
        self.hass.config_entries.async_update_entry(self._entry, title=data["name"])
        return self.async_create_entry(title="", data=data)
