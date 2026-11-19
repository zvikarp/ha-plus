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
const brightnessPercent = (brightness) => Math.round(brightness * 100 / 255);

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
    this._errorMessage = '';
  }

  static getStubConfig(hass) {
    const lights = Object.values(hass?.states ?? {}).filter((state) => LIGHT_ENTITY.test(state.entity_id));
    const colorLight = lights.find((state) => {
      const modes = state.attributes.supported_color_modes;
      return Array.isArray(modes) && modes.some((mode) => COLOR_MODES.includes(mode));
    });
    return { entity: (colorLight ?? lights[0])?.entity_id ?? 'light.your_light' };
  }

  set hass(hass) {
    this._hass = hass;
    this.updateCard();
  }

  setConfig(config) {
    if (typeof config?.entity !== 'string' || !LIGHT_ENTITY.test(config.entity)) {
      throw new Error('Choose a light entity, such as light.bedroom_strip.');
    }
    const colors = config.colors ?? DEFAULT_COLORS;
    const effects = config.effects ?? DEFAULT_EFFECTS;
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
    if (!Array.isArray(effects)) {
      throw new Error('effects must be a list of effect presets.');
    }
    const effectPresets = Array.from(effects, (preset, index) => {
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
    this._action = null;
    this._errorMessage = '';
    this._layoutKey = null;
    this.updateCard();
  }

  getControls(state) {
    const modes = state?.attributes.supported_color_modes;
    const knownModes = Array.isArray(modes) && modes.some((mode) => mode !== 'unknown');
    const hasBrightness = this._config.show_brightness
      && (!knownModes || modes.some((mode) => BRIGHTNESS_MODES.includes(mode)));
    const hasColors = this._config.colors.length > 0
      && (!knownModes || modes.some((mode) => COLOR_MODES.includes(mode)));
    const { effect_list: effectList, supported_features: features } = state?.attributes ?? {};
    let effects = this._config.show_effects ? this._config.effects : [];
    if (Array.isArray(effectList)) {
      effects = effects.filter((preset) => effectList.includes(preset.effect));
    } else if (Number.isInteger(features) && !(features & 4)) {
      // Home Assistant's legacy LightEntityFeature.EFFECT flag.
      effects = [];
    }
    return { hasBrightness, hasColors, effects };
  }

  updateCard() {
    if (!this._config || !this._hass) return;
    const state = this._hass.states[this._config.entity];
    const controls = this.getControls(state);
    const layoutKey = state
      ? JSON.stringify([controls.hasBrightness, controls.hasColors, controls.effects.map((preset) => preset.effect)])
      : 'missing';

    if (layoutKey !== this._layoutKey) {
      this._layoutKey = layoutKey;
      this._brightnessDraft = null;
      if (!state) {
        this.shadowRoot.innerHTML = '<ha-card><p style="padding: 16px" role="status"></p></ha-card>';
        this.shadowRoot.querySelector('p').textContent = `Entity not found: ${this._config.entity}`;
        return;
      }
      this.render(controls);
    }
    if (!state) return;

    const isOn = state.state === 'on';
    const available = isOn || state.state === 'off';
    const reported = state.attributes.brightness;
    const brightness = isOn && Number.isInteger(reported) && reported >= 0 && reported <= 255
      ? reported : null;
    const stateLabel = this._hass.formatEntityState?.(state) ?? {
      on: 'On', off: 'Off', unavailable: 'Unavailable', unknown: 'Unknown',
    }[state.state] ?? state.state;

    const root = this.shadowRoot;
    root.querySelector('.entity-name').textContent = state.attributes.friendly_name || this._config.entity;
    root.querySelector('.entity-state').textContent = brightness === null
      ? stateLabel : `${stateLabel} • ${brightnessPercent(brightness)}%`;

    const power = root.querySelector('.power-button');
    power.disabled = !available;
    power.classList.toggle('on', isOn);
    power.classList.toggle('off', !isOn);
    power.setAttribute('aria-pressed', String(isOn));

    for (const control of root.querySelectorAll('.brightness-slider, .color-button, .effect-button')) {
      control.disabled = !isOn;
    }
    if (!isOn) this._brightnessDraft = null;
    this.updateBrightness(this._brightnessDraft ?? (state.state === 'off' ? 0 : brightness));
    this.showError();
  }

  updateBrightness(brightness) {
    const slider = this.shadowRoot.querySelector('.brightness-slider');
    if (!slider) return;
    const label = brightness === null ? '—' : `${brightnessPercent(brightness)}%`;
    slider.value = brightness ?? 0;
    slider.setAttribute('aria-valuetext', brightness === null ? 'Brightness unavailable' : label);
    this.shadowRoot.querySelector('.brightness-value').textContent = label;
  }

  render({ hasBrightness, hasColors, effects }) {
    const hasEffects = effects.length > 0;
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
          position: relative;
          padding: 8px 0;
        }
        .brightness-slider {
          width: 100%;
          height: 6px;
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
          grid-template-columns: repeat(${Math.min(this._config.columns, this._config.colors.length || 1)}, minmax(0, 1fr));
          gap: 10px;
        }
        .color-button {
          aspect-ratio: 1;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 600;
          color: white;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
          position: relative;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24);
        }
        .color-button::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, transparent 50%, rgba(0, 0, 0, 0.2) 100%);
          pointer-events: none;
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
        
        button:disabled,
        input:disabled {
          opacity: 0.38;
          cursor: default;
          pointer-events: none;
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
              <div class="entity-state"></div>
            </div>
            <button class="power-button" type="button" aria-label="Power">
              <svg class="power-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M16.56 5.44l-1.45 1.45A5.969 5.969 0 0 1 18 12a6 6 0 0 1-6 6 6 6 0 0 1-6-6c0-2.17 1.16-4.06 2.88-5.12L7.44 5.44A7.961 7.961 0 0 0 4 12a8 8 0 0 0 8 8 8 8 0 0 0 8-8c0-2.72-1.36-5.12-3.44-6.56M13 3h-2v10h2V3z"/>
              </svg>
            </button>
          </div>
          ${hasBrightness ? `
            <div class="brightness-section">
              <div class="brightness-header">
                <label class="brightness-label" for="brightness">Brightness</label>
                <span class="brightness-value" aria-hidden="true"></span>
              </div>
              <div class="brightness-slider-wrapper">
                <input id="brightness" type="range" class="brightness-slider" min="0" max="255">
              </div>
            </div>
          ` : ''}
          ${hasBrightness && (hasColors || hasEffects) ? '<div class="section-divider"></div>' : ''}
          ${hasColors ? `
            <section aria-labelledby="colors">
              <h2 id="colors" class="section-title">Colors</h2>
              <div class="colors-section"></div>
            </section>
          ` : ''}
          ${hasColors && hasEffects ? '<div class="section-divider"></div>' : ''}
          ${hasEffects ? `
            <section aria-labelledby="effects">
              <h2 id="effects" class="section-title">Effects</h2>
              <div class="effects-section"></div>
            </section>
          ` : ''}
          <p class="service-error" role="alert"></p>
        </div>
      </ha-card>
    `;

    const root = this.shadowRoot;
    const header = root.querySelector('.card-header');
    if (header) header.textContent = this._config.title;

    root.querySelector('.power-button').addEventListener('click', () => this.togglePower());
    const slider = root.querySelector('.brightness-slider');
    if (slider) {
      slider.addEventListener('input', () => {
        this._brightnessDraft = Number(slider.value);
        this.updateBrightness(this._brightnessDraft);
      });
      slider.addEventListener('change', () => {
        const brightness = Number(slider.value);
        this._brightnessDraft = null;
        this.setBrightness(brightness);
      });
      slider.addEventListener('pointercancel', () => this.cancelBrightnessEdit());
      slider.addEventListener('blur', () => this.cancelBrightnessEdit());
    }

    const colorsSection = root.querySelector('.colors-section');
    if (colorsSection) {
      for (const color of this._config.colors) {
        const button = this.ownerDocument.createElement('button');
        button.type = 'button';
        button.className = 'color-button';
        button.style.backgroundColor = `rgb(${color.rgb.join(',')})`;
        button.title = color.name;
        button.setAttribute('aria-label', color.name);
        button.addEventListener('click', () => this.callLight('turn_on', { rgb_color: [...color.rgb] }));
        colorsSection.append(button);
      }
    }

    const effectsSection = root.querySelector('.effects-section');
    if (effectsSection) {
      for (const preset of effects) {
        const button = this.ownerDocument.createElement('button');
        button.type = 'button';
        button.className = 'effect-button';
        const label = this.ownerDocument.createElement('span');
        label.className = 'effect-button-text';
        label.textContent = preset.name;
        button.append(label);
        button.addEventListener('click', () => this.callLight('turn_on', { effect: preset.effect }));
        effectsSection.append(button);
      }
    }
  }

  cancelBrightnessEdit() {
    if (this._brightnessDraft === null) return;
    this._brightnessDraft = null;
    this.updateCard();
  }

  get lightState() {
    return this._hass?.states[this._config?.entity]?.state;
  }

  togglePower() {
    const state = this.lightState;
    if (state === 'on') return this.callLight('turn_off');
    if (state === 'off') return this.callLight('turn_on');
  }

  setBrightness(brightness) {
    if (this.lightState !== 'on') return;
    if (brightness === 0) return this.callLight('turn_off');
    return this.callLight('turn_on', { brightness });
  }

  async callLight(service, data = {}) {
    const state = this.lightState;
    if (state !== 'on' && (state !== 'off' || Object.keys(data).length > 0)) return;
    const action = {};
    this._action = action;
    this._errorMessage = '';
    this.showError();
    try {
      await this._hass.callService('light', service, {
        entity_id: this._config.entity,
        ...data,
      });
    } catch {
      if (this._action !== action) return;
      this._errorMessage = 'Could not control this light. Try again.';
      this.updateCard();
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
    const state = this._hass?.states[this._config.entity];
    if (this._hass && !state) return 1;
    const { hasBrightness, hasColors, effects } = this.getControls(state);
    const colorCount = this._config.colors.length;
    const colorColumns = Math.min(colorCount, this._config.columns);
    const colorRows = hasColors ? Math.ceil(colorCount / colorColumns) : 0;
    const effectRows = Math.ceil(effects.length / 2);
    const colorHeight = hasColors ? 28 + colorRows * (320 / colorColumns + 10) : 0;
    const height = 80 + (this._config.title ? 55 : 0) + (hasBrightness ? 80 : 0)
      + colorHeight + (effectRows ? 28 + effectRows * 56 : 0);
    return Math.ceil(height / 50);
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
