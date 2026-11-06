# HA+ IR Mapper has moved

The integration now has its own repository:
[**zvikarp/ha-plus-ir-mapper**](https://github.com/zvikarp/ha-plus-ir-mapper).

For HACS, add `https://github.com/zvikarp/ha-plus-ir-mapper` as an **Integration**.
HACS installs from source; no GitHub Release is required for a custom installation.
This is separate from inclusion in HACS's default catalog.

Existing installations keep the same `broadlink_ir_mapper` domain, config entries,
entity unique IDs, YAML configuration, and BroadLink learned commands. Do not
remove the configured integration from Home Assistant or recreate devices.

If HACS installed it from `zvikarp/ha-plus`, back up your configuration and code,
remove the old HACS installation/custom-repository entry, and install from the new
repository before restarting HA. See the maintained
[migration instructions](https://github.com/zvikarp/ha-plus-ir-mapper#moving-from-the-ha-plus-repository).

Source, documentation, tests, issues, CI, and releases are maintained in the new
repository. This directory remains as a link for existing bookmarks.
