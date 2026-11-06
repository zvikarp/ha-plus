"""BroadLink IR lights, supporting both existing YAML and native HA setup."""

from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

DOMAIN = "broadlink_ir_mapper"


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    return True


async def async_setup_entry(hass, entry):
    from .frontend import async_register_frontend

    await async_register_frontend(hass)
    await hass.config_entries.async_forward_entry_setups(entry, [Platform.LIGHT])
    entry.async_on_unload(entry.add_update_listener(_reload))
    return True


async def _reload(hass, entry):
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass, entry):
    return await hass.config_entries.async_unload_platforms(entry, [Platform.LIGHT])
