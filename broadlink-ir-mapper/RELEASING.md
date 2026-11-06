# IR mapper release checks

## Automated verification

From the repository root, create a Python 3.13 environment and run:

```sh
pip install -r requirements-ir-minimum.txt
ruff check custom_components/broadlink_ir_mapper tests/ir_mapper scripts/package_ir_mapper.py
ruff format --check custom_components/broadlink_ir_mapper tests/ir_mapper scripts/package_ir_mapper.py
pytest
python scripts/package_ir_mapper.py
```

Repeat in a separate Python 3.14 environment using
`requirements-ir-current.txt`. CI runs both pinned Home Assistant versions and
uploads an installable ZIP artifact. Tests use Home Assistant's real YAML loader,
entity registration, and light services; remote transmission is simulated.

## BroadLink hardware acceptance (required before publishing)

Record HA version, BroadLink model/firmware, light model, date, tester, and results
in the release notes. These checks require a physical device and are not covered
by CI. No completed hardware test is claimed by this change.

1. Install the generated archive into a clean HA configuration. Confirm YAML
   validation, entity creation, and its configured unique ID.
2. Learn actual IR codes and test power on/off, every configured color and effect,
   with both raw and `b64:`-prefixed configuration values.
3. Test small brightness changes, larger changes, full range, brightness zero,
   and a remote with only one configured brightness direction. Compare physical
   behavior with the documented approximation.
4. Disconnect the BroadLink device. Confirm action errors and that failed sends
   do not report successful power/color/brightness changes. Reconnect and retry.
5. Trigger overlapping on/color/effect/off actions. Confirm transmission order
   and final physical state.
6. Restart HA while the light is on. Confirm no startup IR traffic, documented
   initial assumed state, and successful explicit resynchronization.
7. Upgrade an existing YAML installation. Confirm entity ID/unique ID continuity.
   Restore its previous files and compatible HA version to verify rollback.
8. After publishing the draft, verify HACS custom-repository installation and
   update using the released ZIP; this distribution check is separate from CI.

## Build and publish

The HACS integration is under `custom_components/broadlink_ir_mapper`; add-on and
card files are not included in its archive. `scripts/package_ir_mapper.py` creates
`broadlink_ir_mapper.zip`, with only integration files at the archive root.

On `main`, run **Actions → Release IR mapper**, enter
`v<manifest version>`, and check the hardware verification checkbox only
after completing the checks above. The workflow reruns both CI jobs and creates
an immutable-tagged **draft** release with the ZIP. It refuses a tag that differs
from the manifest version. Existing tags/releases are not overwritten.

Review the draft, add actual hardware results, and publish it when ready. For
later releases, update the manifest version and release notes in a reviewed PR
first. No release is published automatically by merging a PR.
