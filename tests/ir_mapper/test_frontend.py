"""Concurrent entry setups must not register duplicate static routes or panels."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from custom_components.broadlink_ir_mapper.frontend import async_register_frontend


async def test_frontend_registration_is_serialized():
    hass = SimpleNamespace(
        data={}, http=SimpleNamespace(async_register_static_paths=AsyncMock())
    )
    with (
        patch(
            "homeassistant.loader.async_get_integration",
            return_value=SimpleNamespace(version="1.0.0"),
        ),
        patch("custom_components.broadlink_ir_mapper.frontend.add_extra_js_url") as add,
        patch(
            "custom_components.broadlink_ir_mapper.frontend.async_register_panel",
            new_callable=AsyncMock,
        ) as panel,
    ):
        await asyncio.gather(
            async_register_frontend(hass), async_register_frontend(hass)
        )
        assert hass.http.async_register_static_paths.await_count == 1
        assert panel.await_count == 1
        assert add.call_args.args[1].endswith("ir-mapper.js?v=1.0.0")
        assert panel.call_args.kwargs["require_admin"] is False
