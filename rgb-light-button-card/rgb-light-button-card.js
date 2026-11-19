/**
 * RGB Light Button Card
 * A custom Lovelace card for controlling RGB lights with preset color buttons
 * Perfect for cheap AliExpress RGB LED strips with limited color options
 * 
 * @version 1.0.0
 */

const CARD_TYPE = 'rgb-light-button-card';
const COLOR_MODES = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'];
const BRIGHTNESS_MODES = [...COLOR_MODES, 'brightness', 'color_temp', 'white'];
const LIGHT_ENTITY = /^light\.[a-z0-9_]+$/;
const LEGACY_EFFECT = 4;
const LEGACY_COLOR = 16;
// The older brightness, color-temperature, color and white-value flags imply dimming.
const LEGACY_BRIGHTNESS = 1 | 2 | LEGACY_COLOR | 128;
const isAvailable = (state) => state?.state === 'on' || state?.state === 'off';

function lightCapabilities({ supported_color_modes: modes, supported_features: flags } = {}) {
  if (Array.isArray(modes) && modes.some((mode) => mode !== 'unknown')) {
    return {
      color: modes.some((mode) => COLOR_MODES.includes(mode)),
      brightness: modes.some((mode) => BRIGHTNESS_MODES.includes(mode)),
    };
  }
  if (!Array.isArray(modes) && Number.isInteger(flags)) {
    return { color: Boolean(flags & LEGACY_COLOR), brightness: Boolean(flags & LEGACY_BRIGHTNESS) };
  }
  return {};
}

// Default colors based on typical cheap LED remote controls
const DEFAULT_COLORS = [
  { name: 'Red', rgb: [255, 0, 0] },
  { name: 'Green', rgb: [0, 255, 0] },
  { name: 'Blue', rgb: [0, 0, 255] },
  { name: 'White', rgb: [255, 255, 255] },
  { name: 'Orange', rgb: [255, 165, 0] },
  { name: 'Cyan', rgb: [0, 255, 255] },
  { name: 'Purple', rgb: [128, 0, 128] },
  { name: 'Yellow', rgb: [255, 255, 0] },
  { name: 'Pink', rgb: [255, 192, 203] },
  { name: 'Lime', rgb: [50, 205, 50] },
  { name: 'Magenta', rgb: [255, 0, 255] },
  { name: 'Warm White', rgb: [255, 230, 180] }
];

// Default flash modes
const DEFAULT_EFFECTS = [
  { name: 'Flash', effect: 'flash' },
  { name: 'Strobe', effect: 'strobe' },
  { name: 'Fade', effect: 'fade' },
  { name: 'Smooth', effect: 'smooth' }
];

class RgbLightButtonCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.resetCommands();
  }

  static getStubConfig(hass) {
    const lights = Object.values(hass?.states ?? {}).filter((state) => LIGHT_ENTITY.test(state.entity_id));
    const available = lights.filter(isAvailable);
    const choices = available.length ? available : lights;
    const colorLight = choices.find((state) => lightCapabilities(state.attributes).color);
    return { entity: (colorLight ?? choices[0])?.entity_id ?? 'light.your_light' };
  }

  set hass(hass) {
    const previous = this._hass;
    const wasAvailable = isAvailable(this.light);
    this._hass = hass;
    if (previous && (!hass || hass.connected === false
        || (previous.connection && previous.connection !== hass.connection)
        || (wasAvailable && !isAvailable(this.light)))) {
      this.resetCommands();
    }
    this.updateCard();
  }

  resetCommands() {
    this._action = null;
    this._powerAction = null;
    this._brightnessAction = null;
    this._brightnessDraft = null;
    this._errorMessage = '';
  }

  setConfig(config) {
    if (typeof config?.entity !== 'string' || !LIGHT_ENTITY.test(config.entity)) {
      throw new Error('Choose a light entity, such as light.bedroom_strip.');
    }
    const colors = config.colors ?? DEFAULT_COLORS;
    const effects = config.effects;
    const columns = config.columns ?? 4;
    const title = config.title ?? '';
    const show_brightness = config.show_brightness ?? true;
    const show_effects = config.show_effects ?? true;
    if (!Number.isSafeInteger(columns) || columns < 1) {
      throw new Error('columns must be a positive integer.');
    }
    if (typeof title !== 'string' || typeof show_brightness !== 'boolean' || typeof show_effects !== 'boolean') {
      throw new Error('title must be text and show_brightness and show_effects must be true or false.');
    }
    if (!Array.isArray(colors)) {
      throw new Error('colors must be a list of color presets.');
    }
    const colorPresets = Array.from(colors, (color, index) => {
      if (typeof color?.name !== 'string' || !color.name.trim()
          || !Array.isArray(color.rgb) || color.rgb.length !== 3
          || !Array.from(color.rgb).every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
        throw new Error(`Color preset ${index + 1} needs a name and three RGB integers from 0 to 255.`);
      }
      return { name: color.name, rgb: [...color.rgb] };
    });
    if (effects != null && !Array.isArray(effects)) {
      throw new Error('effects must be a list of effect presets.');
    }
    const effectPresets = effects == null ? null : Array.from(effects, (preset, index) => {
      if (typeof preset?.name !== 'string' || !preset.name.trim()
          || typeof preset.effect !== 'string' || !preset.effect.trim()) {
        throw new Error(`Effect preset ${index + 1} needs a name and an effect ID.`);
      }
      return { name: preset.name, effect: preset.effect };
    });

    this._config = {
      entity: config.entity, title, columns, show_brightness, show_effects,
      colors: colorPresets, effects: effectPresets,
    };
    this.resetCommands();
    this.render();
    this.updateCard();
  }

  get light() {
    return this._hass?.states?.[this._config?.entity];
  }

  getControls(state) {
    const capabilities = lightCapabilities(state?.attributes);
    const hasBrightness = this._config.show_brightness && capabilities.brightness !== false;
    const hasColors = this._config.colors.length > 0 && capabilities.color !== false;
    const { effect_list: effectList, supported_features: features } = state?.attributes ?? {};
    const customEffects = this._config.effects;
    let effects = [];
    if (this._config.show_effects) {
      if (Array.isArray(effectList)) {
        const available = new Set(effectList.filter((effect) => typeof effect === 'string' && effect.trim()));
        if (customEffects) {
          effects = customEffects.filter((preset) => available.has(preset.effect));
        } else {
          effects = DEFAULT_EFFECTS.filter((preset) => available.delete(preset.effect));
          for (const effect of available) {
            if (effects.length === DEFAULT_EFFECTS.length) break;
            effects.push({ name: effect, effect });
          }
        }
      } else if (!Number.isInteger(features) || (features & LEGACY_EFFECT)) {
        effects = customEffects ?? DEFAULT_EFFECTS;
      }
    }
    return { hasBrightness, hasColors, effects };
  }

  text(key, fallback) {
    return this._hass?.localize?.(key) || fallback;
  }

  formatBrightness(brightness) {
    const language = this._hass?.locale?.language ?? this._hass?.language;
    if (!this._percentFormatter || this._percentLanguage !== language) {
      this._percentLanguage = language;
      this._percentFormatter = new Intl.NumberFormat(language, {
        style: 'percent', maximumFractionDigits: 0,
      });
    }
    return this._percentFormatter.format(brightness / 255);
  }

  disconnectedCallback() {
    this.resetCommands();
    this.updateCard();
  }

  stateText(state) {
    if (!this._hass) return 'Loading…';
    if (this._hass.connected === false) {
      return this.text('ui.notification_toast.connection_lost', 'Connection lost. Reconnecting…');
    }
    if (!state) return this.text('state_badge.default.entity_not_found', 'Entity not found');
    return this._hass.formatEntityState?.(state) || {
      on: 'On', off: 'Off', unavailable: 'Unavailable', unknown: 'Unknown',
    }[state.state] || state.state;
  }

  updateCard() {
    if (!this._config) return;
    const state = this.light;
    const disconnected = this._hass?.connected === false;
    const isOn = state?.state === 'on';
    const canAdjust = !disconnected && isOn && !this._powerAction;
    const attributes = state?.attributes ?? {};
    const { hasBrightness, hasColors, effects } = this.getControls(state);
    const showBrightness = Boolean(state && hasBrightness);
    const showColors = Boolean(state && hasColors);
    const showEffects = Boolean(state && effects.length);
    const reported = attributes.brightness;
    const brightness = isOn && Number.isInteger(reported) && reported >= 0 && reported <= 255
      ? reported : null;

    const root = this.shadowRoot;
    const focused = root.activeElement;
    const entityName = state && this._hass.formatEntityName?.(state);
    root.querySelector('.entity-name').textContent = entityName || attributes.friendly_name || this._config.entity;
    const stateText = this.stateText(state);
    const status = root.querySelector('.entity-state-label');
    if (status.textContent !== stateText) status.textContent = stateText;
    root.querySelector('.entity-brightness').textContent = brightness === null || disconnected
      ? '' : ` • ${this.formatBrightness(brightness)}`;

    const power = root.querySelector('.power-button');
    power.disabled = disconnected || !isAvailable(state);
    power.classList.toggle('on', isOn);
    power.classList.toggle('off', !isOn);
    power.setAttribute('aria-label', this.text('ui.card.media_player.power', 'Power'));
    power.setAttribute('aria-pressed', String(isOn));
    power.setAttribute('aria-disabled', String(power.disabled || Boolean(this._powerAction)));

    root.querySelector('.brightness-section').hidden = !showBrightness;
    root.querySelector('.colors-panel').hidden = !showColors;
    root.querySelector('.effects-panel').hidden = !showEffects;
    root.querySelector('.after-brightness').hidden = !showBrightness || !(showColors || showEffects);
    root.querySelector('.after-colors').hidden = !showColors || !showEffects;
    root.querySelector('.brightness-label').textContent = this.text('ui.card.light.brightness', 'Brightness');
    root.querySelector('#colors').textContent = this.text('ui.dialogs.more_info_control.light.color', 'Colors');
    root.querySelector('#effects').textContent = this.text('ui.panel.lovelace.editor.features.types.light-effect.effects', 'Effects');
    this.updateEffects(state ? effects : []);

    if (!canAdjust || !showBrightness) this._brightnessDraft = null;
    root.querySelector('.brightness-slider').disabled = !canAdjust || !showBrightness;
    for (const [index, button] of Array.from(root.querySelectorAll('.color-button')).entries()) {
      button.disabled = !canAdjust || !showColors;
      const rgb = this._config.colors[index].rgb;
      const active = isOn && Array.isArray(attributes.rgb_color)
        && attributes.rgb_color.length === 3 && rgb.every((component, index) => component === attributes.rgb_color[index]);
      button.setAttribute('aria-pressed', String(active));
    }
    for (const button of root.querySelectorAll('.effect-button')) {
      button.disabled = !canAdjust || !showEffects;
      button.setAttribute('aria-pressed', String(isOn && button.dataset.effect === attributes.effect));
    }
    const active = root.activeElement;
    if (!power.disabled && focused && (!active
        || (active === focused && (active.disabled || active.closest('[hidden]'))))) {
      power.focus({ preventScroll: true });
    }
    this.updateBrightness(this._brightnessDraft ?? this._brightnessAction?.brightness
      ?? (state?.state === 'off' ? 0 : brightness));
    this.showError();
  }

  updateBrightness(brightness) {
    const slider = this.shadowRoot.querySelector('.brightness-slider');
    const label = brightness === null ? '—' : this.formatBrightness(brightness);
    slider.value = brightness ?? 0;
    slider.setAttribute('aria-valuetext', brightness === null ? this.text('state.default.unavailable', 'Unavailable') : label);
    this.shadowRoot.querySelector('.brightness-value').textContent = label;
  }

  render() {
    this._effectLayoutKey = null;
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        ha-card {
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          font-size: 18px;
          font-weight: 500;
          color: var(--primary-text-color);
          border-bottom: 1px solid var(--divider-color);
          overflow-wrap: anywhere;
        }
        .card-content {
          flex: 1;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        /* Control section */
        .control-section {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .entity-info {
          flex: 1;
          min-width: 0;
        }
        .entity-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--primary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .entity-state {
          font-size: 12px;
          color: var(--secondary-text-color);
          margin-top: 2px;
        }
        .power-button {
          flex-shrink: 0;
          width: 48px;
          height: 48px;
          border: none;
          border-radius: 24px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }
        .power-button::before {
          content: '';
          position: absolute;
          inset: 0;
          background: currentColor;
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .power-button:hover::before {
          opacity: 0.08;
        }
        .power-button:active::before {
          opacity: 0.12;
        }
        .power-button.on {
          background: var(--primary-color);
          color: var(--text-primary-color, white);
        }
        .power-button.off {
          background: var(--disabled-color, rgba(0, 0, 0, 0.12));
          color: var(--secondary-text-color);
        }
        .power-icon {
          width: 24px;
          height: 24px;
          position: relative;
          z-index: 1;
        }
        
        /* Brightness section */
        .brightness-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .brightness-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .brightness-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--secondary-text-color);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .brightness-value {
          font-size: 12px;
          font-weight: 500;
          color: var(--primary-text-color);
        }
        .brightness-slider-wrapper {
          display: flex;
          align-items: center;
        }
        .brightness-slider {
          width: 100%;
          height: 44px;
          margin: 0;
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          cursor: pointer;
        }
        .brightness-slider::-webkit-slider-track {
          width: 100%;
          height: 6px;
          background: var(--disabled-color, rgba(0, 0, 0, 0.12));
          border-radius: 3px;
        }
        .brightness-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          margin-top: -7px;
          background: var(--primary-color);
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid var(--card-background-color);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: transform 0.1s ease;
        }
        .brightness-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }
        .brightness-slider::-moz-range-track {
          width: 100%;
          height: 6px;
          background: var(--disabled-color, rgba(0, 0, 0, 0.12));
          border-radius: 3px;
        }
        .brightness-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: var(--primary-color);
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid var(--card-background-color);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: transform 0.1s ease;
        }
        .brightness-slider::-moz-range-thumb:hover {
          transform: scale(1.2);
        }
        
        /* Section divider */
        .section-divider {
          height: 1px;
          background: var(--divider-color);
          margin: 4px 0;
        }
        
        /* Section title */
        .section-title {
          font-size: 12px;
          font-weight: 500;
          color: var(--secondary-text-color);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin: 0 0 12px;
        }
        
        /* Colors section */
        .colors-section {
          display: grid;
          --columns: ${Math.min(this._config.columns, this._config.colors.length || 1)};
          grid-template-columns: repeat(auto-fill,
            minmax(min(100%, max(44px, calc((100% + 10px) / var(--columns) - 10px))), 1fr));
          gap: 10px;
        }
        .color-button {
          border: 1px solid var(--divider-color);
          padding: 0;
          border-radius: 8px;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          display: grid;
          grid-template-rows: minmax(44px, auto) 1fr;
          font: inherit;
          font-size: 12px;
          color: var(--primary-text-color);
          background: var(--card-background-color);
          overflow: hidden;
        }
        .color-swatch {
          aspect-ratio: 1.35;
          min-height: 44px;
          background: var(--swatch);
          border-bottom: 1px solid var(--divider-color);
        }
        .color-label {
          padding: 4px 2px;
          overflow-wrap: anywhere;
        }
        .color-button[aria-pressed="true"],
        .effect-button[aria-pressed="true"] {
          border-color: var(--primary-color, currentColor);
          box-shadow: inset 0 0 0 1px var(--primary-color, currentColor);
          font-weight: 700;
        }
        .color-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 3px 6px rgba(0, 0, 0, 0.16), 0 3px 6px rgba(0, 0, 0, 0.23);
        }
        .color-button:active {
          transform: translateY(0);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
        }
        
        /* Effects section */
        .effects-section {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .effect-button {
          padding: 14px 16px;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          background: var(--card-background-color);
          color: var(--primary-text-color);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .effect-button::before {
          content: '';
          position: absolute;
          inset: 0;
          background: var(--primary-color);
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .effect-button:hover::before {
          opacity: 0.08;
        }
        .effect-button:active::before {
          opacity: 0.12;
        }
        .effect-button:hover {
          border-color: var(--primary-color);
          color: var(--primary-color);
        }
        .effect-button-text {
          overflow-wrap: anywhere;
          position: relative;
          z-index: 1;
        }
        
        [hidden] {
          display: none !important;
        }
        button:disabled,
        input:disabled {
          opacity: 0.38;
          cursor: default;
          pointer-events: none;
        }
        .power-button[aria-disabled="true"]:not(:disabled) {
          opacity: 0.65;
          cursor: wait;
        }
        button:focus-visible,
        input:focus-visible {
          outline: 2px solid var(--primary-color, currentColor);
          outline-offset: 3px;
        }
        .service-error {
          color: var(--error-color, var(--primary-text-color));
          margin: 0;
          overflow-wrap: anywhere;
        }
        .service-error:empty {
          position: absolute;
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            transition: none !important;
            transform: none !important;
          }
        }
      </style>
      
      <ha-card>
        ${this._config.title ? '<div class="card-header"></div>' : ''}
        <div class="card-content">
          <div class="control-section">
            <div class="entity-info">
              <div class="entity-name"></div>
              <div class="entity-state"><span class="entity-state-label" role="status"></span><span class="entity-brightness"></span></div>
            </div>
            <button class="power-button" type="button" aria-label="Power">
              <svg class="power-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M16.56 5.44l-1.45 1.45A5.969 5.969 0 0 1 18 12a6 6 0 0 1-6 6 6 6 0 0 1-6-6c0-2.17 1.16-4.06 2.88-5.12L7.44 5.44A7.961 7.961 0 0 0 4 12a8 8 0 0 0 8 8 8 8 0 0 0 8-8c0-2.72-1.36-5.12-3.44-6.56M13 3h-2v10h2V3z"/>
              </svg>
            </button>
          </div>
          <div class="brightness-section" hidden>
            <div class="brightness-header">
              <label class="brightness-label" for="brightness">Brightness</label>
              <span class="brightness-value" aria-hidden="true"></span>
            </div>
            <div class="brightness-slider-wrapper">
              <input id="brightness" type="range" class="brightness-slider" min="0" max="255" disabled>
            </div>
          </div>
          <div class="section-divider after-brightness" hidden></div>
          <section class="colors-panel" aria-labelledby="colors" hidden>
            <h2 id="colors" class="section-title">Colors</h2>
            <div class="colors-section"></div>
          </section>
          <div class="section-divider after-colors" hidden></div>
          <section class="effects-panel" aria-labelledby="effects" hidden>
            <h2 id="effects" class="section-title">Effects</h2>
            <div class="effects-section"></div>
          </section>
          <p class="service-error" role="alert"></p>
        </div>
      </ha-card>
    `;

    const root = this.shadowRoot;
    const header = root.querySelector('.card-header');
    if (header) header.textContent = this._config.title;

    // One delegated listener per card, including effects inserted after discovery.
    root.querySelector('ha-card').addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || button.getRootNode() !== root || button.disabled || this._powerAction) return;
      if (button.matches('.power-button')) {
        this.callLight(this.light.state === 'on' ? 'turn_off' : 'turn_on', {}, { power: true });
      } else if (button.matches('.color-button')) {
        const color = this._config.colors[Number(button.dataset.index)];
        this.callLight('turn_on', { rgb_color: [...color.rgb] });
      } else if (button.matches('.effect-button')) {
        this.callLight('turn_on', { effect: button.dataset.effect });
      }
    });

    const slider = root.querySelector('.brightness-slider');
    slider.addEventListener('input', () => {
      if (slider.getRootNode() !== root || slider.disabled) return;
      this._brightnessDraft = Number(slider.value);
      this.updateBrightness(this._brightnessDraft);
    });
    slider.addEventListener('change', () => {
      if (slider.getRootNode() !== root || slider.disabled) return;
      const brightness = Number(slider.value);
      this._brightnessDraft = null;
      if (brightness === 0) {
        this.callLight('turn_off', {}, { brightness, power: true });
      } else {
        this.callLight('turn_on', { brightness }, { brightness });
      }
    });
    const cancel = () => {
      if (slider.getRootNode() === root) this.cancelBrightnessEdit();
    };
    slider.addEventListener('pointercancel', cancel);
    slider.addEventListener('blur', cancel);

    const colorsSection = root.querySelector('.colors-section');
    this._config.colors.forEach((color, index) => {
      const button = this.ownerDocument.createElement('button');
      button.type = 'button';
      button.className = 'color-button';
      button.dataset.index = index;
      button.title = color.name;
      button.setAttribute('aria-label', color.name);
      const swatch = this.ownerDocument.createElement('span');
      swatch.className = 'color-swatch';
      swatch.style.setProperty('--swatch', `rgb(${color.rgb.join(',')})`);
      swatch.setAttribute('aria-hidden', 'true');
      const label = this.ownerDocument.createElement('span');
      label.className = 'color-label';
      label.textContent = color.name;
      button.append(swatch, label);
      colorsSection.append(button);
    });
  }

  updateEffects(effects) {
    const layoutKey = JSON.stringify(effects.map(({ name, effect }) => [name, effect]));
    if (this._effectLayoutKey === layoutKey) return;
    this._effectLayoutKey = layoutKey;

    const section = this.shadowRoot.querySelector('.effects-section');
    const active = this.shadowRoot.activeElement;
    const buttons = effects.map((preset) => {
      const button = this.ownerDocument.createElement('button');
      button.type = 'button';
      button.className = 'effect-button';
      button.dataset.effect = preset.effect;
      const label = this.ownerDocument.createElement('span');
      label.className = 'effect-button-text';
      label.textContent = preset.name;
      button.append(label);
      return button;
    });
    section.replaceChildren(...buttons);
    if (active?.matches('.effect-button') && this.light?.state === 'on' && !this._powerAction
        && this._hass?.connected !== false) {
      buttons.find((button) => button.dataset.effect === active.dataset.effect
        && button.textContent === active.textContent)?.focus({ preventScroll: true });
    }
  }

  cancelBrightnessEdit() {
    if (this._brightnessDraft === null) return;
    this._brightnessDraft = null;
    this.updateCard();
  }

  async callLight(service, data, { brightness, power = false } = {}) {
    const state = this.light;
    if (!this.isConnected || this._hass?.connected === false || !isAvailable(state) || this._powerAction
        || (!power && state.state !== 'on')) return;
    const action = { brightness };
    this._action = action;
    if (power) this._powerAction = action;
    if (brightness !== undefined) this._brightnessAction = action;
    this._errorMessage = '';
    this.updateCard();
    try {
      await this._hass.callService('light', service, {
        entity_id: this._config.entity,
        ...data,
      });
    } catch {
      if (this._action === action) {
        this._errorMessage = 'Could not control this light. Try again.';
      }
    } finally {
      const update = [this._action, this._powerAction, this._brightnessAction].includes(action);
      if (this._powerAction === action) this._powerAction = null;
      if (this._brightnessAction === action) this._brightnessAction = null;
      if (update) this.updateCard();
    }
  }

  showError() {
    const message = this.shadowRoot.querySelector('.service-error');
    if (message && message.textContent !== this._errorMessage) {
      message.textContent = this._errorMessage;
    }
  }

  getCardSize() {
    if (!this._config) return 1;
    const state = this.light;
    if (this._hass && !state) return 2;
    const { hasBrightness, hasColors, effects } = this.getControls(state);
    const colorCount = this._config.colors.length;
    const colorWidth = this.shadowRoot.querySelector('.colors-section')?.clientWidth || 320;
    const fittingColumns = Math.max(1, Math.floor((colorWidth + 10) / 54));
    const colorColumns = Math.min(colorCount, this._config.columns, fittingColumns);
    const colorRows = hasColors ? Math.ceil(colorCount / colorColumns) : 0;
    const effectRows = Math.ceil(effects.length / 2);
    const colorHeight = hasColors ? 28 + colorRows * (Math.max(44, colorWidth / colorColumns / 1.35) + 34) : 0;
    const height = 80 + (this._config.title ? 55 : 0) + (hasBrightness ? 90 : 0)
      + colorHeight + (effectRows ? 28 + effectRows * 56 : 0);
    return Math.ceil(height / 50);
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }
}

if (!customElements.get(CARD_TYPE)) {
  customElements.define(CARD_TYPE, RgbLightButtonCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === CARD_TYPE)) {
  window.customCards.push({
    type: CARD_TYPE,
    name: 'RGB Light Button Card',
    description: 'A card for controlling RGB lights with preset color buttons',
    preview: false,
    documentationURL: 'https://github.com/zvikarp/ha-plus/tree/main/rgb-light-button-card',
  });
}
