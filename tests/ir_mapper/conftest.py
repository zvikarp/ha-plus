"""Run the actual HA platform registration, without BroadLink hardware."""

import pytest

pytest_plugins = "pytest_homeassistant_custom_component"


@pytest.fixture(autouse=True)
def custom_integrations(enable_custom_integrations):
    return None


@pytest.fixture(autouse=True)
def frontend_registration():
    from unittest.mock import AsyncMock, patch

    with patch(
        "custom_components.broadlink_ir_mapper.frontend.async_register_frontend",
        new_callable=AsyncMock,
    ) as register:
        yield register
