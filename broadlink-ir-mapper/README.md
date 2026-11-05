# BroadLink IR Remote Mapper

<img src="../resources/ha-plus-ir-mapper.png" alt="HA Plus BroadLink IR Mapper" width="140">

A Home Assistant custom integration that maps IR remote commands from BroadLink devices to Home Assistant light entities. This is specifically designed for LED lights and other IR-controlled devices that don't have native Home Assistant support.

## Problem It Solves

When you have IR-controlled LED lights that work with BroadLink remotes and the BroadLink integration in Home Assistant, the lights themselves don't appear as controllable entities in Home Assistant. You can only send raw IR commands. This integration bridges that gap by:

1. Creating proper Home Assistant light entities
2. Mapping IR remote button codes to light controls (colors, effects, brightness)
3. Allowing you to control IR lights through Home Assistant UI, automations, and voice assistants

## Features

- ✅ Creates Home Assistant light entities for IR-controlled devices
- ✅ Maps IR codes to RGB colors
- ✅ Maps IR codes to effects (flash, strobe, fade, etc.)
- ✅ Brightness control via IR up/down commands
- ✅ Power on/off control
- ✅ Works with existing BroadLink integration
- ✅ Supports multiple lights with different configurations
- ✅ Compatible with RGB Light Button Card for easy control

## Requirements

- Home Assistant with BroadLink integration already set up
- BroadLink remote entity (e.g., `remote.broadlink_rm4_remote`)
- IR codes learned/configured in BroadLink integration

## Installation

### Method 1: Manual Installation

1. Copy the `broadlink-ir-mapper` folder to your Home Assistant `custom_components` directory:
   ```
   config/
   └── custom_components/
       └── broadlink_ir_mapper/
           ├── __init__.py
           ├── light.py
           ├── manifest.json
           └── README.md
   ```

2. Restart Home Assistant

3. Configure your lights in `configuration.yaml` (see Configuration section below)

### Method 2: HACS (When Available)

If this integration is published to HACS:

1. Open HACS → Integrations
2. Click "+" → "Custom repositories"
3. Add repository URL
4. Install "BroadLink IR Remote Mapper"
5. Restart Home Assistant

## Configuration

### Basic Setup

Add to your `configuration.yaml`:

```yaml
light:
  - platform: broadlink_ir_mapper
    name: "Living Room LED Strip"
    broadlink_remote: remote.broadlink_rm4_remote
    ir_codes:
      power_on: "JgBQAAABJZIUEhQ6..."  # Your learned IR code
      power_off: "JgBQAAABJZIUEhQ7..."  # Your learned IR code
      brightness_up: "JgBQAAABJZIU..."    # Optional
      brightness_down: "JgBQAAABJZI..."  # Optional
    colors:
      - name: "Red"
        rgb: [255, 0, 0]
        ir_code: "JgBQAAABJZIUEhQ6..."
      - name: "Green"
        rgb: [0, 255, 0]
        ir_code: "JgBQAAABJZIUEhQ6..."
      - name: "Blue"
        rgb: [0, 0, 255]
        ir_code: "JgBQAAABJZIUEhQ6..."
    effects:
      - name: "Flash"
        ir_code: "JgBQAAABJZIUEhQ6..."
      - name: "Fade"
        ir_code: "JgBQAAABJZIUEhQ6..."
```

### Configuration Options

| Option | Required | Type | Description |
|--------|----------|------|-------------|
| `name` | Yes | string | Name of the light entity |
| `broadlink_remote` | Yes | entity_id | BroadLink remote entity ID |
| `ir_codes.power_on` | Yes | string | IR code to turn light on |
| `ir_codes.power_off` | Yes | string | IR code to turn light off |
| `ir_codes.brightness_up` | No | string | IR code to increase brightness |
| `ir_codes.brightness_down` | No | string | IR code to decrease brightness |
| `colors` | No | list | List of color configurations |
| `effects` | No | list | List of effect configurations |
| `unique_id` | No | string | Unique ID for the entity |

### Color Configuration

Each color entry requires:

```yaml
- name: "Color Name"       # Display name
  rgb: [R, G, B]           # RGB values (0-255)
  ir_code: "JgBQAAAB..."   # IR code to activate this color
```

### Effect Configuration

Each effect entry requires:

```yaml
- name: "Effect Name"      # Display name
  ir_code: "JgBQAAAB..."   # IR code to activate this effect
```

## How to Get IR Codes

You need to learn IR codes from your physical remote using the BroadLink integration:

### Method 1: BroadLink Integration Learn Service

1. Go to Developer Tools → Services
2. Service: `remote.learn_command`
3. Entity: Your BroadLink remote
4. Data:
   ```yaml
   entity_id: remote.broadlink_rm4_remote
   device: led_strip
   command: power_on
   ```
5. Press the button on your physical remote
6. The learned code will be saved and you can find it in the BroadLink configuration

### Method 2: BroadLink App

1. Use the BroadLink app to learn commands
2. Export the codes from the app
3. Convert to Home Assistant format if needed

### Example: Learning All Codes for LED Strip

```yaml
# In Developer Tools → Services, run these one by one:

# Learn power on
service: remote.learn_command
data:
  entity_id: remote.broadlink_rm4_remote
  device: led_strip
  command: power_on

# Learn red button
service: remote.learn_command
data:
  entity_id: remote.broadlink_rm4_remote
  device: led_strip
  command: red

# Repeat for all buttons...
```

## Complete Example Configuration

```yaml
light:
  # Bedroom LED Strip
  - platform: broadlink_ir_mapper
    name: "Bedroom LED Strip"
    unique_id: bedroom_led_strip_ir
    broadlink_remote: remote.broadlink_rm4_remote
    ir_codes:
      power_on: "JgBQAAABJZIUEhQ6FBIUEhQSFBIUEhQ6FDoUOhQ6FDoUEhQSFBIUOhQSFBIUEhQSFBIUEhQSFBIUOhQ6FDoUOhQ6FDoUOhQSFAAFGgABJ0kUAA0FAAAAAAAAAAA="
      power_off: "JgBQAAABJpIUEhQ6FBIUEhQSFBIUEhQ6FDoUOhQ6FDoUEhQSFDoUEhQSFBIUEhQSFBIUEhQSFDoUOhQ6FDoUOhQ6FBIUOhQABRoAAScADQU="
      brightness_up: "JgBQAAABJZMUEhM7ExIUEhQSFBIUEhQ6EzoUOhQ6FDoUEhQSFBIUEhQ6FBIUEhQSFBIUEhQSFBIUOhQ6FDoUOhQ6FDoUOhQABRoAAScADQU="
      brightness_down: "JgBQAAABJZMTEhQ6FBIUEhQSFBIUEhQ6FDoUOhQ6FDoUEhQSFBIUEhQSFBIUOhQ6FBIUEhQSFBIUOhQ6FDoUOhQ6FDoUABRoAAScADQU="
    colors:
      - name: "Red"
        rgb: [255, 0, 0]
        ir_code: "JgBQAAABJZIUEhQ6FBIUEhQSFBIUEhQ6FDoUOhQ6FDoUOhQSFBIUEhQSFBIUEhQSFBIUEhQSFBIUOhQ6FDoUOhQ6FDoUOhQABRoAAScADQU="
      - name: "Green"
        rgb: [0, 255, 0]
        ir_code: "JgBQAAABJZMUERM7FBIUEhMSFBIUEhQ6EzoUOhQ6FDoUOhQSFBIUEhQSFBIUEhQSFBIUEhQSFBIUOhQ6FDoUOhQ6FDoUOhQABRoAAScADQU="
      - name: "Blue"
        rgb: [0, 0, 255]
        ir_code: "JgBQAAABJpITEhQ6FBIUEhQSFBIUEhQ6FDoUOhQ6FDoUOhQSFBIUEhQSFBIUEhQSFBIUEhQSFBIUOhQ6FDoUOhQ6FDoUOhQABRkAAScADQU="
      - name: "White"
        rgb: [255, 255, 255]
        ir_code: "JgBQAAABJpIUEhM6FBIUEhQSFBIUEhQ6FDoUOhQ6FDoUOhQSFBIUEhQSFBIUEhQSFBIUEhQSFBIUOhQ6FDoUOhQ6FDoUOhQABRoAAScADQU="
      - name: "Orange"
        rgb: [255, 165, 0]
        ir_code: "JgBQAAABJZMTEhQ6FBIUEhQSExMUEhM6FDoUOhQ6EzoUOhQ6ExIUEhQSFBIUEhQSFBIUEhQSFBIUOhQ6FDoUOhQ6FDoUOhQABRoAAScADQU="
      - name: "Cyan"
        rgb: [0, 255, 255]
        ir_code: "JgBQAAABJpIUEhM6FBIUEhQSFBIUEhQ6FDoTOhQ6FDoUOhQ6FBIUEhQSFBIUEhQSFBIUEhQSFBIUOhQ6FDoUOhQ6FDoUOhQABRkAAScADQU="
      - name: "Purple"
        rgb: [128, 0, 128]
        ir_code: "JgBQAAABJ5IUEhM6FBIUEhQSFBIUEhQ6FDoUOhQ6FDoUOhQ6FBIUOhQSFBIUEhQSFBIUEhQSFBIUOhQ6FDoUOhQ6FDoUOhQABRkAAScADQU="
      - name: "Yellow"
        rgb: [255, 255, 0]
        ir_code: "JgBQAAABJ5ITEhQ6FBIUEhQSFBIUEhQ6EzoUOhQ6FDoUOhQ6FBIUEhQSFDoUEhQSFBIUEhQSFBIUOhQ6FDoUOhQ6FDoUOhQABRkAAScADQU="
    effects:
      - name: "Flash"
        ir_code: "JgBQAAABJpIUEhM6FBIUEhQSFBIUEhQ6FDoUOhQ6FDoUEhQ6FDoUEhQSFBIUEhQSFBIUEhQSFBIUOhQ6FDoUOhQ6FDoUOhQABRkAAScADQU="
      - name: "Strobe"
        ir_code: "JgBQAAABJ5ITEhQ6FBIUEhQSFBIUEhQ6FDoTOhQ6FDoUEhQ6FBIUOhQSFBIUEhQSFBIUEhQSFBIUOhQ6FDoUOhQ6FDoUOhQABRkAAScADQU="
      - name: "Fade"
        ir_code: "JgBQAAABJpIUEhM6FBIUEhQSFBIUEhQ6FDoUOhQ6FDoUEhQ6FBIUEhQ6FBIUEhQSFBIUEhQSFBIUOhQ6FDoUOhQ6FDoUOhQABRkAAScADQU="
      - name: "Smooth"
        ir_code: "JgBQAAABJpIUEhM6FBIUEhQSFBIUEhQ6FDoUOhQ6FDoUEhQ6FBIUEhQSFDoUEhQSFBIUEhQSFBIUOhQ6FDoUOhQ6FDoUOhQABRkAAScADQU="

  # Kitchen LED Strip  
  - platform: broadlink_ir_mapper
    name: "Kitchen LED Strip"
    unique_id: kitchen_led_strip_ir
    broadlink_remote: remote.broadlink_rm_mini
    ir_codes:
      power_on: "JgBQAAABKJEVERM..."
      power_off: "JgBQAAABKJEVERQ..."
    colors:
      - name: "Warm White"
        rgb: [255, 230, 180]
        ir_code: "JgBQAAABKJEV..."
      - name: "Cool White"
        rgb: [200, 220, 255]
        ir_code: "JgBQAAABKJEV..."
```

## Usage

Once configured, your IR lights will appear as regular Home Assistant light entities:

### In Home Assistant UI

The lights will appear in:
- Overview dashboard
- Light controls
- Scenes
- Automations

### Via Services

```yaml
# Turn on with specific color
service: light.turn_on
target:
  entity_id: light.bedroom_led_strip
data:
  rgb_color: [255, 0, 0]  # Red

# Turn on with effect
service: light.turn_on
target:
  entity_id: light.bedroom_led_strip
data:
  effect: Flash

# Adjust brightness
service: light.turn_on
target:
  entity_id: light.bedroom_led_strip
data:
  brightness: 200
```

### With RGB Light Button Card

This integration works perfectly with the RGB Light Button Card:

```yaml
type: custom:rgb-light-button-card
entity: light.bedroom_led_strip
title: Bedroom LEDs
show_brightness: true
show_effects: true
```

The button card will automatically use the colors and effects you configured!

## Integration with Voice Assistants

Once configured, you can control your IR lights with voice:

- "Hey Google, turn on the bedroom LED strip"
- "Alexa, set bedroom LED strip to red"
- "Hey Google, set bedroom LED strip to fade effect"

## Troubleshooting

### Light doesn't respond

1. **Check BroadLink remote entity** - Make sure it's available and working
2. **Verify IR codes** - Test codes directly using `remote.send_command`
3. **Check line of sight** - BroadLink needs clear IR line of sight to the device
4. **Test with BroadLink app** - Verify codes work in the BroadLink app first

### Colors don't match

- The integration uses the closest RGB match
- Make sure RGB values match what your remote actually produces
- Some cheap LED strips have limited color accuracy

### Brightness control doesn't work

- Brightness requires `brightness_up` and `brightness_down` IR codes
- The integration approximates brightness by sending multiple commands
- Some remotes don't have brightness control

### Effects don't appear

- Make sure `effects` are properly configured in YAML
- Check that effect IR codes are learned correctly
- Verify effect names match what you configured

## Technical Details

### How It Works

1. Integration creates a virtual light entity in Home Assistant
2. When you control the light (color, effect, etc.), it maps your action to the appropriate IR code
3. It sends the IR code through your BroadLink remote
4. The IR remote transmits to your LED light

### Supported Features

The integration automatically detects supported features based on your configuration:

- **SUPPORT_BRIGHTNESS**: If `brightness_up` or `brightness_down` codes provided
- **SUPPORT_COLOR**: If `colors` list is provided
- **SUPPORT_EFFECT**: If `effects` list is provided

### Limitations

- **State tracking**: The light entity tracks state locally (can't read actual device state)
- **Brightness steps**: Brightness is approximated with up/down commands
- **Color matching**: Uses closest RGB match from configured colors
- **One-way communication**: Can send commands but can't receive status updates

## Compatibility

- **Home Assistant**: 2021.4.0 or newer
- **BroadLink Integration**: Any version with learned IR commands
- **Devices**: Any IR-controlled LED light with BroadLink remote

## Contributing

Found a bug or have a suggestion? Please open an issue or submit a pull request!

## License

MIT License

## Credits

Created for controlling cheap IR-controlled LED lights through Home Assistant with BroadLink integration support.
