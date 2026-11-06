"""Native guided setup, learning, cancellation, options, and entry lifecycle."""

import asyncio
from copy import deepcopy
from unittest.mock import patch

import pytest
from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import HomeAssistantError
from pytest_homeassistant_custom_component.common import MockConfigEntry

DOMAIN = "broadlink_ir_mapper"


@pytest.fixture(autouse=True)
def skip_dependencies():
    with patch(
        "homeassistant.config_entries.async_process_deps_reqs", return_value=True
    ):
        yield


async def start(hass):
    hass.states.async_set("remote.test", "on")
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    return await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {"name": "Desk lamp", "broadlink_remote": "remote.test", "brightness_steps": 8},
    )


async def learn(hass, result, kind, **fields):
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"next_step_id": "learn"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"kind": kind, **fields}
    )
    assert result["type"] in (FlowResultType.SHOW_PROGRESS, FlowResultType.FORM)
    await hass.async_block_till_done()
    result = await hass.config_entries.flow.async_configure(result["flow_id"])
    assert result["step_id"] == "learned"
    return await hass.config_entries.flow.async_configure(
        result["flow_id"], {"received": True}
    )


async def test_guided_setup_learning_testing_and_finish(hass):
    calls = []

    async def command(call):
        calls.append((call.service, dict(call.data)))

    hass.services.async_register("remote", "learn_command", command)
    hass.services.async_register("remote", "send_command", command)
    result = await start(hass)
    missing = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"next_step_id": "finish"}
    )
    assert missing["errors"] == {"base": "missing_power"}
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    for kind in ["power_on", "power_off"]:
        result = await learn(hass, result, kind)
    result = await learn(hass, result, "color", name="Coral", rgb=[255, 90, 80])
    result = await learn(hass, result, "effect", name="Gentle fade")
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"next_step_id": "test"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"command": "colors:0"}
    )
    with patch(
        "custom_components.broadlink_ir_mapper.async_setup_entry", return_value=True
    ):
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"], {"next_step_id": "finish"}
        )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    data = result["data"]
    assert data["name"] == "Desk lamp"
    assert data["brightness_steps"] == 8
    assert data["colors"][0]["rgb"] == [255, 90, 80]
    assert data["ir_codes"]["power_on"]["device"].startswith("ha_plus_ir_")
    assert calls[0][0] == "learn_command"
    assert calls[1][0] == "send_command"
    assert calls[0][1]["command"] == calls[1][1]["command"]
    assert len({c[1]["command"] for c in calls if c[0] == "learn_command"}) == 4


async def test_learning_failure_and_cancel_do_not_create_entries(hass):
    async def fail(call):
        raise HomeAssistantError("No code received")

    hass.services.async_register("remote", "learn_command", fail)
    result = await start(hass)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"next_step_id": "learn"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"kind": "power_on"}
    )
    await hass.async_block_till_done()
    result = await hass.config_entries.flow.async_configure(result["flow_id"])
    assert result["errors"]["base"] == "learn_failed"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["step_id"] == "learn"
    hass.config_entries.flow.async_abort(result["flow_id"])
    assert not hass.config_entries.async_entries(DOMAIN)


async def test_cancel_stops_pending_learning(hass):
    cancelled = asyncio.Event()

    async def wait(call):
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    hass.services.async_register("remote", "learn_command", wait)
    result = await start(hass)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"next_step_id": "learn"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"kind": "power_on"}
    )
    await asyncio.sleep(0)
    hass.config_entries.flow.async_abort(result["flow_id"])
    await asyncio.wait_for(cancelled.wait(), 1)
    assert not hass.config_entries.async_entries(DOMAIN)


def entry_data():
    return {
        "name": "Desk lamp",
        "unique_id": "fixed-id",
        "learned_device": "ha_plus_ir_test",
        "broadlink_remote": "remote.test",
        "brightness_steps": 8,
        "ir_codes": {
            "power_on": {"device": "ha_plus_ir_test", "command": "on"},
            "power_off": {"device": "ha_plus_ir_test", "command": "off"},
            "brightness_up": {"device": "ha_plus_ir_test", "command": "up"},
        },
        "colors": [],
        "effects": [],
    }


async def test_options_cancel_preserves_data_and_save_preserves_identity(hass):
    hass.states.async_set("remote.test", "on")
    entry = MockConfigEntry(domain=DOMAIN, title="Desk lamp", data=entry_data())
    entry.add_to_hass(hass)
    before = deepcopy(dict(entry.data))
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"name": "Changed", "brightness_steps": 12}
    )
    hass.config_entries.options.async_abort(result["flow_id"])
    assert entry.data == before
    assert entry.options == {}
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"name": "Changed", "brightness_steps": 12}
    )
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "finish"}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options["brightness_steps"] == 12
    assert entry.options["unique_id"] == before["unique_id"]
    assert entry.options["ir_codes"] == before["ir_codes"]


async def test_entry_registers_entity_services_and_unloads(hass):
    hass.states.async_set("remote.test", "on")
    calls = []

    async def send(call):
        calls.append(dict(call.data))

    hass.services.async_register("remote", "send_command", send)
    entry = MockConfigEntry(domain=DOMAIN, title="Desk lamp", data=entry_data())
    entry.add_to_hass(hass)
    with patch("homeassistant.setup.async_process_deps_reqs", return_value=True):
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
    state = hass.states.get("light.desk_lamp")
    assert state.attributes["ir_mapper"]
    await hass.services.async_call(
        DOMAIN, "resynchronize", {"entity_id": "light.desk_lamp"}, blocking=True
    )
    assert len(calls) == 9
    assert calls[-1]["device"] == "ha_plus_ir_test"
    assert calls[-1]["command"] == "up"
    assert hass.states.get("light.desk_lamp").attributes["brightness"] == 255
    assert await hass.config_entries.async_unload(entry.entry_id)


async def test_silent_learning_failure_is_caught_by_reference_test(hass):
    async def learn_without_code(call):
        return None

    async def missing_reference(call):
        raise ValueError("Command not found in BroadLink storage")

    hass.services.async_register("remote", "learn_command", learn_without_code)
    hass.services.async_register("remote", "send_command", missing_reference)
    result = await start(hass)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"next_step_id": "learn"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"kind": "power_on"}
    )
    await hass.async_block_till_done()
    result = await hass.config_entries.flow.async_configure(result["flow_id"])
    assert result["errors"]["base"] == "learn_failed"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["step_id"] == "learn"
    hass.config_entries.flow.async_abort(result["flow_id"])
    assert not hass.config_entries.async_entries(DOMAIN)
