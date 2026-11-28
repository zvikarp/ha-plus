# RGB card regression evidence

This audit starts from `702347b`, after the earlier reliability and compatibility
fixes. The ten `Regression:` scenarios in `browser.html` were first run against
that unchanged module: **45 passed, 10 failed**. They cover the following bugs.

| # | Reproduction and observed failure | Correction |
| --- | --- | --- |
| 1 | Open the card in Chrome: the range has a thumb but no track. The browser rejects `::-webkit-slider-track`. | Use `::-webkit-slider-runnable-track`, retaining the Firefox rule. |
| 2 | Render a 280 px card with a wrapping title: the masonry estimate was 600 px for 813 px of content. | Use the rendered height when layout is available; retain the estimate before layout. |
| 3 | Keep an Arabic interface language and select a different number format: percentages ignore that preference. | Select and cache the formatter using the number-format preference, including system and unformatted choices. |
| 4 | Submit brightness 220, leave its service response pending, then report the light off: the disabled slider still displays 86%. | Let the confirmed off state override pending brightness and invalidate obsolete adjustments. |
| 5 | Submit a slow brightness adjustment, then press power: the power action can finish before the earlier `turn_on`, which can turn the light back on. | Dispatch commands in input order. Discard queued commands after target/connection changes and recheck availability/capabilities before sending. |
| 6 | Press power twice, waiting for each service response while the state snapshot still says on: both calls turn off, so the second press cannot turn the light back on. | Use Home Assistant's `light.toggle` action for the power button. Zero brightness still explicitly calls `turn_off`. |
| 7 | Edit the title while power is pending, then press power again: rebuilding configuration drops the pending lock and sends a duplicate request. | Preserve command ownership when editing presentation for the same light; changing the target still invalidates old work. |
| 8 | Focus a color button, then mark the light unavailable: focus is lost or remains on a disabled control because power is disabled too. | Park focus on the named card group, then restore it to power when the light recovers. Do not steal focus from other cards. |
| 9 | Report empty/unknown color modes and explicit legacy flags of zero: unsupported brightness and RGB controls appear. | Consult legacy flags when modern modes provide no information, while preserving modern mode precedence. |
| 10 | Reapply an identical configuration during a slider edit: the live input is replaced, losing its draft and keyboard focus. | Normalize and compare configuration before rebuilding the layout. |

The expanded browser suite also checks ordered brightness requests, target and
connection invalidation, off/on cycles, capability changes while queued, focus
outside the card, and the interactive preview. Existing async tests wait for
ordered dispatch; their configuration-invalidation scenario now changes the
actual target entity. The preview implements the same toggle action as the card.

## Running the checks

Serve the repository root over HTTP and open
`rgb-light-button-card/tests/browser.html`. The page reports its result in
`#summary[data-status]`. The existing `card-checks.yml` workflow runs it in Chrome
for pull requests. Also run:

```sh
node --check rgb-light-button-card/rgb-light-button-card.js
git diff --check
```

Tests use simulated Home Assistant state and deferred service responses. They do
not exercise a live Home Assistant installation or physical lights. The WebKit
selector is verified in Chrome's CSS parser and with a preview screenshot;
Safari and Firefox have not been run separately.

## API references

- [Home Assistant light actions](https://www.home-assistant.io/integrations/light/)
- [Home Assistant number-format preference mapping](https://github.com/home-assistant/frontend/blob/dev/src/common/number/format_number.ts)
- [Range track pseudo-element](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::-webkit-slider-runnable-track)
- [Custom card sizing](https://contributors.home-assistant.io/frontend/custom-ui/card/)
