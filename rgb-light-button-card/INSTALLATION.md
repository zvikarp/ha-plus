# Install RGB Light Button Card

The RGB Light Button Card is a custom Home Assistant dashboard card. Install it
as a dashboard resource.

1. Download [rgb-light-button-card.js](https://raw.githubusercontent.com/zvikarp/ha-plus/main/rgb-light-button-card/rgb-light-button-card.js).
2. Copy the file to Home Assistant's `/config/www/` directory. Create the directory
   if needed. If you just created `www`, restart Home Assistant so it serves
   the directory at `/local/`.
3. Enable **Advanced Mode** in your Home Assistant profile. Go to **Settings →
   Dashboards**, open the three-dot menu, and select **Resources**.
4. Add `/local/rgb-light-button-card.js` as a **JavaScript module** and refresh
   your dashboard.
5. Edit the dashboard, add the **RGB Light Button Card**, and configure the
   entity. You can also add a **Manual** card with this YAML.

   ```yaml
   type: custom:rgb-light-button-card
   entity: light.your_light
   ```

## Manage the resource in YAML

If you manage dashboard resources in `configuration.yaml`, add the module to
the existing `lovelace` block. Keep your other resources and dashboard settings.

```yaml
lovelace:
  resource_mode: yaml
  resources:
    - url: /local/rgb-light-button-card.js
      type: module
```

Reload resources or restart Home Assistant to apply the change, then refresh the
dashboard.

## Troubleshooting

- If Home Assistant says the custom element is missing, open
  `/local/rgb-light-button-card.js` on your Home Assistant server. It should
  return JavaScript. Check the location of the file and the resource type.
- If an old version appears after an update, hard-refresh the dashboard or
  append a version query to the resource URL, such as
  `/local/rgb-light-button-card.js?v=2`.
- If a preset is missing, inspect the light in **Developer Tools → States**.
  Color presets need a supported color mode. Effect IDs must match
  `effect_list` when Home Assistant reports it.

See the [configuration reference](./README.md#configuration) and
[examples](./example-config.yaml). Report problems on
[GitHub Issues](https://github.com/zvikarp/ha-plus/issues).
