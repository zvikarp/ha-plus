# RGB Light Button Card

<img src="../resources/ha-plus-general.png" alt="HA Plus RGB Light Button Card" width="140">

A custom Home Assistant Lovelace card for controlling RGB lights with preset color buttons. Perfect for cheap AliExpress RGB LED strips and other lights with limited color options.

## Features

- **Power Control**: Simple ON/OFF toggle button
- **Preset Color Buttons**: Quick access to common colors (default colors match typical cheap LED remotes)
- **Brightness Control**: Slider for adjusting brightness
- **Effect Modes**: Flash, Strobe, Fade, and Smooth effects
- **Fully Configurable**: Customize colors, effects, and layout per light instance
- **Works with Any RGB Light**: Use with cheap RGB strips or regular lights with limited color options

## Default Colors

The card defaults to colors commonly found on cheap AliExpress LED remote controls:
- Red, Green, Blue, White
- Orange, Cyan, Purple, Yellow
- Pink, Lime, Magenta, Warm White

## Installation

### Method 1: Manual Installation

1. Download `rgb-light-button-card.js` from this repository
2. Copy it to your Home Assistant `config/www` folder
3. Add the following to your `configuration.yaml`:

```yaml
lovelace:
  resources:
    - url: /local/rgb-light-button-card.js
      type: module
```

4. Restart Home Assistant
5. Clear your browser cache

### Method 2: HACS (Home Assistant Community Store)

If this card is published to HACS:

1. Open HACS in Home Assistant
2. Go to "Frontend"
3. Click the "+" button
4. Search for "RGB Light Button Card"
5. Click "Install"
6. Restart Home Assistant
7. Clear your browser cache

## Configuration

### Basic Configuration

```yaml
type: custom:rgb-light-button-card
entity: light.bedroom_led_strip
```

### Full Configuration Example

```yaml
type: custom:rgb-light-button-card
entity: light.bedroom_led_strip
title: Bedroom RGB Strip
show_brightness: true
show_effects: true
columns: 4
colors:
  - name: Red
    rgb: [255, 0, 0]
  - name: Green
    rgb: [0, 255, 0]
  - name: Blue
    rgb: [0, 0, 255]
  - name: White
    rgb: [255, 255, 255]
  - name: Orange
    rgb: [255, 165, 0]
  - name: Cyan
    rgb: [0, 255, 255]
  - name: Purple
    rgb: [128, 0, 128]
  - name: Yellow
    rgb: [255, 255, 0]
effects:
  - name: Flash
    effect: flash
  - name: Strobe
    effect: strobe
  - name: Fade
    effect: fade
  - name: Smooth
    effect: smooth
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `entity` | string | **Required** | Entity ID of the light |
| `title` | string | '' | Card title (optional) |
| `show_brightness` | boolean | true | Show brightness slider |
| `show_effects` | boolean | true | Show effect buttons |
| `columns` | number | 4 | Number of color button columns |
| `colors` | array | Default 12 colors | Custom color buttons (see below) |
| `effects` | array | Default 4 effects | Custom effect buttons (see below) |

### Custom Colors Format

```yaml
colors:
  - name: "Color Name"
    rgb: [R, G, B]  # Values 0-255
```

### Custom Effects Format

```yaml
effects:
  - name: "Effect Name"
    effect: "effect_id"  # Must match your light's supported effects
```

## Usage Examples

### Example 1: Simple Setup for Cheap LED Strip

```yaml
type: custom:rgb-light-button-card
entity: light.aliexpress_led_strip
title: Kitchen LED Strip
```

### Example 2: Limited Colors for Regular Light

```yaml
type: custom:rgb-light-button-card
entity: light.dining_room
title: Dining Room Light
show_effects: false
columns: 3
colors:
  - name: Warm
    rgb: [255, 230, 180]
  - name: Neutral
    rgb: [255, 255, 255]
  - name: Cool
    rgb: [200, 220, 255]
  - name: Red
    rgb: [255, 0, 0]
  - name: Green
    rgb: [0, 255, 0]
  - name: Blue
    rgb: [0, 0, 255]
```

### Example 3: Custom Effect Names

```yaml
type: custom:rgb-light-button-card
entity: light.party_lights
title: Party Mode
effects:
  - name: Rainbow
    effect: rainbow
  - name: Police
    effect: colorloop
  - name: Disco
    effect: random
  - name: Relax
    effect: fade
```

## Compatibility

This card works with any Home Assistant light entity that supports:
- Basic on/off control
- RGB color control (`rgb_color`)
- Brightness control (optional)
- Effects (optional)

Compatible with:
- Cheap AliExpress RGB LED strips
- Tuya-based RGB lights
- ESPHome RGB lights
- Zigbee RGB lights (like IKEA, Philips Hue)
- Any other RGB light in Home Assistant

## Tips

1. **Check your light's supported effects**: Use Developer Tools > States to see what effects your light supports, then configure them in the card
2. **Adjust columns for mobile**: Use fewer columns (2-3) for better mobile display
3. **Hide unused features**: Set `show_brightness: false` or `show_effects: false` if your light doesn't support them
4. **Multiple cards for multiple lights**: Create separate card instances for different lights with different configurations

## Troubleshooting

### Card doesn't appear
- Make sure you've added the resource to `configuration.yaml`
- Clear your browser cache (Ctrl+F5)
- Check the browser console for errors

### Colors don't match
- RGB values must be 0-255
- Check that your light entity supports `rgb_color` service calls

### Effects don't work
- Check your light's supported effects in Developer Tools
- Make sure the effect names match what your light supports
- Some cheap lights may not support all effects

## Screenshots

![RGB Light Button Card Preview](https://github.com/user-attachments/assets/8f3eb5c4-93dc-492f-a605-33f997b849f7)

*The card showing all default features: power toggle, brightness slider, 12 color buttons, and 4 effect buttons*

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License

## Credits

Created for controlling cheap AliExpress RGB LED strips with preset color buttons, but works with any Home Assistant RGB light.
