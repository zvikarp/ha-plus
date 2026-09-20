## [1.1.1](https://github.com/zvikarp/ha-plus-matter-hub/compare/v1.1.0...v1.1.1) (2026-09-20)


### Bug Fixes

* **ci:** build Node 24 images on supported architectures ([bef3919](https://github.com/zvikarp/ha-plus-matter-hub/commit/bef3919132d6f797f47bffac84f1a1437519509d))
* **release:** authenticate initial npm publish ([5d8c93c](https://github.com/zvikarp/ha-plus-matter-hub/commit/5d8c93c5c21e4ff5979f5a5d3f50a987e2526958))
* **release:** publish through GitHub and GHCR ([1519264](https://github.com/zvikarp/ha-plus-matter-hub/commit/15192644896b80f590861fef1d6c10ed4ff4239a))
* **release:** verify public container access ([36d66b6](https://github.com/zvikarp/ha-plus-matter-hub/commit/36d66b68ba442cc66ea8c863de23e8a1b7c869f0))

# Changelog

## Unreleased

### Added

- Searchable exposed-device management grouped by Home Assistant area and readable Matter device type, with immediate device details and manual refresh.
- Friendly loading, empty, error, retry, and not-found states throughout the bridge experience.
- Confirmation dialogs explaining the consequences of factory-resetting or deleting a bridge.
- A recovery screen for unexpected interface rendering failures.

### Fixed

- Restored frontend startup after Home Assistant theme synchronization introduced unsupported palette color values.
- API failures now surface as actionable errors instead of being treated as successful responses.
- Documentation and source links now point to the maintained HA Plus Matter Hub fork.
- Releases now publish versioned GitHub and GHCR artifacts without depending on npm publishing.
- Release jobs verify that Home Assistant can pull published GHCR images without credentials.
- Light and dark documentation branding now use the same finalized Matter Hub icon.
