"""YAML-configured BroadLink IR lights."""

from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the integration; light platforms own their YAML configuration."""
    return True
