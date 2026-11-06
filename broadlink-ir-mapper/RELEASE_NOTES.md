# BroadLink IR Remote Mapper 1.0.0

- Standard Home Assistant integration layout and installable HACS/manual ZIP.
- Accept existing raw base64 and explicitly prefixed IR codes; send BroadLink's
  required `b64:` format.
- Use modern light color modes and effect feature flags.
- Propagate send failures, serialize per-light commands, and retain only completed
  state changes. Brightness follows the relative steps actually sent.
- Preserve existing YAML keys, domain, and unique IDs.

- Native guided setup and options, background IR learning with test-send and
  physical confirmation, and per-device brightness calibration.
- Shared HA+ sidebar and automatically configured dashboard card with real presets,
  effects, assumed state, remote status, inline errors, and send-on-release sliders.
- Explicit resynchronization to full brightness and learned-command references.

Hardware acceptance results must be recorded here or in the draft release before
publication. Automated coverage alone does not verify physical IR reception.
