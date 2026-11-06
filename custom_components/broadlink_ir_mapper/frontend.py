"""Register the shared HA+ IR panel and Lovelace card once per HA runtime."""

import asyncio
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.panel_custom import async_register_panel

from . import DOMAIN


async def async_register_frontend(hass):
    lock = hass.data.setdefault(DOMAIN + "_frontend_lock", asyncio.Lock())
    async with lock:
        key = DOMAIN + "_frontend_registered"
        if hass.data.get(key):
            return
        from homeassistant.loader import async_get_integration

        integration = await async_get_integration(hass, DOMAIN)
        url = f"/broadlink_ir_mapper/ir-mapper.js?v={integration.version}"
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    "/broadlink_ir_mapper/ir-mapper.js",
                    str(Path(__file__).parent / "frontend" / "ir-mapper.js"),
                    cache_headers=False,
                )
            ]
        )
        add_extra_js_url(hass, url)
        await async_register_panel(
            hass,
            webcomponent_name="ha-plus-ir-panel",
            frontend_url_path="ha-plus-ir",
            sidebar_title="HA+ IR",
            sidebar_icon="ha-plus-ir:logo",
            module_url=url,
            require_admin=False,
            config={},
        )
        hass.data[key] = True
