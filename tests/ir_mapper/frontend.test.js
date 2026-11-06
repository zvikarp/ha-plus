import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { parseHTML } from "linkedom";
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function setup({ fail = false, admin = true } = {}) {
	const { window } = parseHTML("<html><body></body></html>");
	const context = vm.createContext({
		window,
		document: window.document,
		HTMLElement: window.HTMLElement,
		customElements: window.customElements,
		CustomEvent: window.CustomEvent,
		console,
	});
	vm.runInContext(
		await readFile(
			new URL(
				"../../custom_components/broadlink_ir_mapper/frontend/ir-mapper.js",
				import.meta.url,
			),
			"utf8",
		),
		context,
	);
	const calls = [];
	const hass = {
		user: { is_admin: admin },
		states: {
			"remote.test": { state: "on" },
			"light.ir": {
				entity_id: "light.ir",
				state: "on",
				attributes: {
					friendly_name: "Desk lamp",
					ir_mapper: true,
					ir_remote: "remote.test",
					ir_colors: [{ name: "Coral", rgb: [255, 90, 80] }],
					effect_list: ["Gentle Fade"],
					rgb_color: [255, 90, 80],
					ir_dimmable: true,
					brightness: 230,
					ir_brightness_steps: 10,
					ir_can_resynchronize: true,
				},
			},
		},
		callService: async (...args) => {
			calls.push(args);
			if (fail) throw new Error("Remote offline");
		},
	};
	const card = window.document.createElement("ha-plus-ir-card");
	card.setConfig({ entity: "light.ir" });
	card.hass = hass;
	window.document.body.append(card);
	return { window, hass, card, calls };
}
test("presets and exact effect names come from entity metadata", async () => {
	const { card, calls } = await setup();
	assert.equal(card.shadowRoot.querySelectorAll(".swatch").length, 1);
	assert.equal(
		card.shadowRoot.querySelector(".swatch").getAttribute("aria-pressed"),
		"true",
	);
	card.shadowRoot.querySelector(".effect").click();
	await tick();
	assert.equal(calls[0][2].effect, "Gentle Fade");
});
test("dragging changes display; only release sends brightness", async () => {
	const { window, card, calls } = await setup();
	const slider = card.shadowRoot.querySelector("input");
	for (const value of [200, 180, 150]) {
		slider.value = value;
		slider.dispatchEvent(new window.Event("input"));
	}
	assert.equal(calls.length, 0);
	slider.dispatchEvent(new window.Event("change"));
	await tick();
	assert.equal(calls.length, 1);
	assert.equal(calls[0][2].brightness, 150);
});
test("errors remain visible and pending commands cannot be doubled", async () => {
	const { card, calls } = await setup({ fail: true });
	card.shadowRoot.querySelector(".power").click();
	card.shadowRoot.querySelector(".power").click();
	await tick();
	assert.equal(calls.length, 1);
	assert.match(
		card.shadowRoot.querySelector('[role="alert"]').textContent,
		/Remote offline/,
	);
	assert.equal(card.shadowRoot.querySelector(".power").disabled, false);
});
test("unavailable remotes disable controls and non-admins have no settings link", async () => {
	const { card, hass } = await setup({ admin: false });
	hass.states["remote.test"].state = "unavailable";
	card.hass = hass;
	assert.equal(card.shadowRoot.querySelector(".power").disabled, true);
	assert.equal(card.shadowRoot.querySelector("a"), null);
});
test("names are rendered as text and resync is an explicit service", async () => {
	const { card, hass, calls } = await setup();
	hass.states["light.ir"].attributes.friendly_name =
		'<img src=x onerror="attack()">';
	card.hass = hass;
	assert.equal(card.shadowRoot.querySelector("img"), null);
	assert.match(card.shadowRoot.querySelector("h2").textContent, /<img/);
	card.shadowRoot.querySelector(".footer button").click();
	await tick();
	assert.equal(calls[0][0], "broadlink_ir_mapper");
	assert.equal(calls[0][1], "resynchronize");
});
test("panel reuses cards and shows native setup and empty states", async () => {
	const { window, hass } = await setup();
	const panel = window.document.createElement("ha-plus-ir-panel");
	panel.hass = hass;
	const card = panel.shadowRoot.querySelector("ha-plus-ir-card");
	panel.hass = hass;
	assert.equal(panel.shadowRoot.querySelector("ha-plus-ir-card"), card);
	assert.match(
		panel.shadowRoot.querySelector("header a").href,
		/domain=broadlink_ir_mapper/,
	);
	delete hass.states["light.ir"];
	panel.hass = hass;
	assert.equal(panel.shadowRoot.querySelector(".empty").hidden, false);
});

test("unrelated HA updates preserve the current slider element", async () => {
	const { card, hass } = await setup();
	const slider = card.shadowRoot.querySelector("input");
	card.hass = {
		...hass,
		states: {
			...hass.states,
			"sensor.unrelated": { state: "new", attributes: {} },
		},
	};
	assert.equal(card.shadowRoot.querySelector("input"), slider);
});
