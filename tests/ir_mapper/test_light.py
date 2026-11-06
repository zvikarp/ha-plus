"""Release regressions for YAML loading, remote commands, and optimistic state."""

import asyncio
from unittest.mock import AsyncMock, Mock, patch

import pytest
import voluptuous as vol
from homeassistant.components.light import ColorMode
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.setup import async_setup_component

from custom_components.broadlink_ir_mapper.light import (
    PLATFORM_SCHEMA,
    BroadLinkIRLight,
)


def config(**overrides):
    return {
        "platform": "broadlink_ir_mapper",
        "name": "IR test",
        "unique_id": "ir_test",
        "broadlink_remote": "remote.test",
        "ir_codes": {
            "power_on": "JgBQAA==",
            "power_off": "b64:JgBQAQ==",
            "brightness_up": "JgBQAg==",
            "brightness_down": "JgBQAw==",
        },
        "colors": [{"name": "Red", "rgb": [255, 0, 0], "ir_code": "JgBQBA=="}],
        "effects": [{"name": "Flash", "ir_code": "JgBQBQ=="}],
        **overrides,
    }


@pytest.fixture
def entity(hass):
    hass.states.async_set("remote.test", "on")
    light = BroadLinkIRLight(PLATFORM_SCHEMA(config()))
    light.hass = hass
    light.async_write_ha_state = Mock()
    return light


def test_yaml_validation_and_capabilities():
    parsed = PLATFORM_SCHEMA(config())
    light = BroadLinkIRLight(parsed)
    assert light.supported_color_modes == {ColorMode.RGB}
    assert light.color_mode == ColorMode.RGB
    assert light.assumed_state
    assert light.unique_id == "ir_test"
    assert not light.should_poll
    assert light.effect_list == ["Flash"]
    assert BroadLinkIRLight(
        PLATFORM_SCHEMA(
            config(
                colors=[],
                ir_codes={
                    "power_on": "JgBQAA==",
                    "power_off": "JgBQAQ==",
                },
            )
        )
    ).supported_color_modes == {ColorMode.ONOFF}
    for change in [
        {"broadlink_remote": "light.wrong"},
        {"colors": [{"name": "Bad", "rgb": [256, 0, 0], "ir_code": "JgBQAA=="}]},
        {"ir_codes": {"power_on": "invalid", "power_off": ""}},
    ]:
        with pytest.raises(vol.Invalid):
            PLATFORM_SCHEMA(config(**change))


async def test_load_documented_yaml_and_call_real_light_service(hass):
    calls = []
    hass.states.async_set("remote.test", "on")

    async def send(call):
        calls.append(call)

    hass.services.async_register("remote", "send_command", send)
    with patch("homeassistant.setup.async_process_deps_reqs", return_value=True):
        assert await async_setup_component(hass, "light", {"light": [config()]})
        await hass.async_block_till_done()
    state = hass.states.get("light.ir_test")
    assert state is not None
    assert state.state == "off"
    assert state.attributes["supported_color_modes"] == [ColorMode.RGB]
    await hass.services.async_call(
        "light",
        "turn_on",
        {"entity_id": "light.ir_test", "rgb_color": [254, 1, 0], "effect": "Flash"},
        blocking=True,
    )
    assert [call.data["command"] for call in calls] == [
        "b64:JgBQAA==",
        "b64:JgBQBA==",
        "b64:JgBQBQ==",
    ]
    assert hass.states.get("light.ir_test").attributes["effect"] == "Flash"
    await hass.services.async_call(
        "light", "turn_off", {"entity_id": "light.ir_test"}, blocking=True
    )
    assert calls[-1].data["command"] == "b64:JgBQAQ=="
    assert hass.states.get("light.ir_test").state == "off"


async def test_failure_propagates_without_false_power_state(entity):
    with patch(
        "homeassistant.core.ServiceRegistry.async_call",
        side_effect=HomeAssistantError("offline"),
    ):
        with pytest.raises(HomeAssistantError, match="offline"):
            await entity.async_turn_on()
    assert not entity.is_on
    entity.async_write_ha_state.assert_called_once()


async def test_partial_failure_retains_successful_changes(entity):
    with patch(
        "homeassistant.core.ServiceRegistry.async_call",
        side_effect=[None, HomeAssistantError("failed color")],
    ):
        with pytest.raises(HomeAssistantError):
            await entity.async_turn_on(rgb_color=[0, 255, 0])
    assert entity.is_on
    assert entity.rgb_color == (255, 0, 0)


async def test_failed_power_off_keeps_assumed_on_state(entity):
    entity._attr_is_on = True
    with patch(
        "homeassistant.core.ServiceRegistry.async_call",
        side_effect=HomeAssistantError("offline"),
    ):
        with pytest.raises(HomeAssistantError):
            await entity.async_turn_off()
    assert entity.is_on


async def test_brightness_tracks_sent_steps_and_partial_failure(entity):
    entity._attr_is_on = True
    with patch(
        "homeassistant.core.ServiceRegistry.async_call", new_callable=AsyncMock
    ) as send:
        await entity.async_turn_on(brightness=240)
        assert send.await_count == 1
        assert entity.brightness == 230
        await entity.async_turn_on(brightness=240)
        assert send.await_count == 1
        assert entity.brightness == 230
        send.reset_mock()
        await entity.async_turn_on(brightness=230)
        send.assert_not_awaited()
    with patch(
        "homeassistant.core.ServiceRegistry.async_call",
        side_effect=[None, HomeAssistantError("offline")],
    ):
        with pytest.raises(HomeAssistantError):
            await entity.async_turn_on(brightness=100)
    assert entity.brightness == 205


async def test_zero_brightness_is_power_off(entity):
    entity._attr_is_on = True
    with patch(
        "homeassistant.core.ServiceRegistry.async_call", new_callable=AsyncMock
    ) as send:
        await entity.async_turn_on(brightness=0)
    assert not entity.is_on
    assert send.call_args.args[2]["command"] == "b64:JgBQAQ=="


async def test_unavailable_remote_and_unknown_effect_do_not_change_state(entity):
    entity.hass.states.async_set("remote.test", "unavailable")
    with pytest.raises(HomeAssistantError, match="unavailable"):
        await entity.async_turn_on()
    assert not entity.is_on
    with pytest.raises(ServiceValidationError, match="Unknown IR effect"):
        await entity.async_turn_on(effect="missing")
    assert not entity.is_on


async def test_commands_are_serialized(entity):
    entered = asyncio.Event()
    release = asyncio.Event()
    commands = []

    async def send(*args, **kwargs):
        commands.append(args[2]["command"])
        if len(commands) == 1:
            entered.set()
            await release.wait()

    with patch("homeassistant.core.ServiceRegistry.async_call", side_effect=send):
        on = asyncio.create_task(entity.async_turn_on(effect="Flash"))
        await entered.wait()
        off = asyncio.create_task(entity.async_turn_off())
        await asyncio.sleep(0)
        assert len(commands) == 1
        release.set()
        await asyncio.gather(on, off)
    assert commands == ["b64:JgBQAA==", "b64:JgBQBQ==", "b64:JgBQAQ=="]
    assert not entity.is_on


async def test_existing_unique_id_retains_entity_id(hass):
    from homeassistant.helpers import entity_registry as er

    registry = er.async_get(hass)
    existing = registry.async_get_or_create(
        "light",
        "broadlink_ir_mapper",
        "ir_test",
        suggested_object_id="my_existing_ir_light",
    )
    with patch("homeassistant.setup.async_process_deps_reqs", return_value=True):
        assert await async_setup_component(hass, "light", {"light": [config()]})
        await hass.async_block_till_done()
    state = hass.states.get(existing.entity_id)
    assert state is not None
    assert state.entity_id == "light.my_existing_ir_light"
    assert state.state == "off"


async def test_one_direction_and_fixed_brightness_rgb(hass):
    cfg = config()
    del cfg["ir_codes"]["brightness_up"]
    hass.states.async_set("remote.test", "on")
    entity = BroadLinkIRLight(PLATFORM_SCHEMA(cfg))
    entity.hass = hass
    entity.async_write_ha_state = Mock()
    with patch(
        "homeassistant.core.ServiceRegistry.async_call", new_callable=AsyncMock
    ) as send:
        await entity.async_turn_on(brightness=230)
        assert send.await_count == 2  # power, then supported down direction
        with pytest.raises(ServiceValidationError, match="brightness_up"):
            await entity.async_turn_on(brightness=255)
        assert send.await_count == 2
    del cfg["ir_codes"]["brightness_down"]
    fixed = BroadLinkIRLight(PLATFORM_SCHEMA(cfg))
    fixed.hass = hass
    fixed.async_write_ha_state = Mock()
    with patch(
        "homeassistant.core.ServiceRegistry.async_call", new_callable=AsyncMock
    ) as send:
        with pytest.raises(ServiceValidationError, match="brightness_down"):
            await fixed.async_turn_on(brightness=100)
        send.assert_not_awaited()
        await fixed.async_turn_on(rgb_color=[255, 0, 0])
        assert fixed.is_on


async def test_brightness_endpoints(entity):
    entity._attr_is_on = True
    with patch(
        "homeassistant.core.ServiceRegistry.async_call", new_callable=AsyncMock
    ) as send:
        await entity.async_turn_on(brightness=1)
        assert entity.brightness == 1
        assert send.await_count == 11
        send.reset_mock()
        await entity.async_turn_on(brightness=255)
        assert entity.brightness == 255
        assert send.await_count == 11
