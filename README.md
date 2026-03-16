# TokenMagic

TokenMagic is a Figma plugin for building a design system from scratch or connecting new components to existing tokens.

It scans selected components, proposes token paths, creates missing variables, and binds safe matches back to the design.

## Current model

TokenMagic works across three token domains:

- `color`
- `typography`
- `device`

The default chain is:

- `base -> semantic -> component`

Two domains stop earlier on purpose:

- icon colors stop at `color/base -> color/semantic/icon/...`
- typography stops at `typography/base -> typography/semantic/...`

So not every property creates a component-level token.

## What it can scan

TokenMagic currently analyzes:

- selected `COMPONENT`
- selected `COMPONENT_SET`
- selected internal layers inside components

It can extract and bind:

- fill color
- stroke color
- stroke weight
- opacity
- width
- height
- corner radii
- padding
- item spacing
- font size
- font family
- font weight
- line height
- letter spacing
- paragraph spacing
- paragraph indent
- effect color
- effect radius
- effect spread
- effect offset X
- effect offset Y

## Token structure

### Color

Examples:

- `color/base/color1/100`
- `color/semantic/bg/action/primary/default`
- `color/component/button/primary/default/bg`

Rules:

- base colors are numbered as `colorN`
- the default alpha ladder is:
  - `100`
  - `80`
  - `60`
  - `40`
  - `20`
  - `10`
  - `0`
- if a new alpha step is introduced, TokenMagic propagates that step across all base colors
- stroke-related groups use `stroke`, not `border`

For icon families:

- no `color/component/...` token is created
- icon colors stop at semantic paths under:
  - `color/semantic/icon/...`

### Typography

Examples:

- `typography/base/font-size/17`
- `typography/semantic/label/font-size`

Typography currently stops at:

- `typography/base`
- `typography/semantic`

No typography component token is created.

### Device

Examples:

- `device/base/size/16`
- `device/semantic/gap/16`
- `device/semantic/stroke/avatar/club/sm/1`
- `device/component/button/height`

Rules:

- `device/base` uses one shared `size` pool
- device semantics are bucket-first:
  - `gap`
  - `spacing`
  - `radius`
  - `stroke`
  - `width`
  - `height`
  - `opacity`
  - `effect`

## Scan controls

TokenMagic has separate scan scopes for:

- `Colors`
- `Typography`
- `Device`

Available modes:

- `Selection only`
- `Selection + internal layers`
- `Selection + semantic internal layers`

Semantic scanning is shaped by:

- `Semantic allowlist`
- `Semantic denylist`

Default denylisted structural names include:

- `primary`
- `secondary`
- `subtract`
- `vector`
- `group`
- `path`
- `mask`

## Presets

Current presets:

- `General`
- `Buttons`
- `Icons`
- `Form controls`
- `Text only`
- `Custom`

Presets prefill scanning strategy. They do not lock the UI.

## Execution workflow

Execution modes:

- `Create and bind`
- `Create only`
- `Bind only`

The UI also includes:

- a live `Preview changes` column
- `Ready to bind`
- `Unmatched`
- `Already bound`
- `Conflicts`
- `Skipped / unsupported`
- `Debug`

Preview updates automatically after selection and settings changes.

## Conflict handling

TokenMagic preflights conflicts before writing.

Current conflict actions:

- `Skip`
- `Reuse existing`
- `Rename proposed`
- `Create deeper semantic token`

Conflict rows show:

- the chain level
- the conflicting path
- the resolved preview path

If a semantic conflict already has a safe deeper fallback, TokenMagic prefers that fallback instead of silently skipping it.

## Shared-value hoisting

If related variants or related components share the same value for the same property, TokenMagic can hoist the token higher in the hierarchy.

Examples:

- shared across all button variants:
  - `device/component/button/height`
- shared across one subtype:
  - `device/component/button/secondary/stroke`

Hoisting is conservative and path-based.

## Text support

Supported text fields:

- `fontSize`
- `fontFamily`
- `fontWeight`
- `lineHeight`
- `letterSpacing`
- `paragraphSpacing`
- `paragraphIndent`

Current text behavior:

- mixed text ranges are supported in a first pass
- range suffixes are stable:
  - `text-range-1`
  - `text-range-2`
- percent `lineHeight` and `letterSpacing` are converted to pixels when a numeric `fontSize` is available

## Effect support

Current effect support covers:

- `DROP_SHADOW`
- `INNER_SHADOW`
- `LAYER_BLUR`
- `BACKGROUND_BLUR`

Supported effect fields:

- shadow color -> `color`
- radius -> `device`
- spread -> `device`
- offset X -> `device`
- offset Y -> `device`

## Skip and safety rules

TokenMagic intentionally avoids creating tokens for values that are just defaults or layout noise.

Current rules include:

- full opacity does not create a standalone opacity token
- width and height are skipped for `HUG` and `FILL`
- zero-value creation is skipped for:
  - gap
  - padding
  - radius
  - stroke weight
- zero-value text layout creation is skipped for:
  - `letterSpacing`
  - `paragraphSpacing`
  - `paragraphIndent`
- `AUTO` line height is skipped
- zero-value effect numerics are skipped for:
  - `effects.radius`
  - `effects.spread`
  - `effects.offsetX`
  - `effects.offsetY`
- padding and gap are only read from auto-layout nodes
- nested component instances are ignored
- layers inside nested instances are ignored too
- masks and subtract/boolean wrapper nodes are treated as structural stop-nodes

## Unsupported cases

The plugin reports unsupported cases instead of guessing.

Current unsupported cases include:

- multiple visible fills
- multiple visible strokes
- gradients
- image paints
- text values that still cannot be resolved safely
- unsupported effect types

## Testing

Current verification flow:

- `npm run build`
- `npm test`
- manual runtime checks in [TESTING.md](/Users/Nikita/Desktop/Файлы/PORTFOLIO/WEB/TokenMagic/TESTING.md)

## Project structure

- [src/code.ts](/Users/Nikita/Desktop/Файлы/PORTFOLIO/WEB/TokenMagic/src/code.ts)
  Plugin logic: scanning, matching, path generation, creation, conflict handling, and binding.
- [src/ui.html](/Users/Nikita/Desktop/Файлы/PORTFOLIO/WEB/TokenMagic/src/ui.html)
  Plugin UI markup and UI logic.
- [src/ui.css](/Users/Nikita/Desktop/Файлы/PORTFOLIO/WEB/TokenMagic/src/ui.css)
  Plugin UI styling.
- [src/testable.ts](/Users/Nikita/Desktop/Файлы/PORTFOLIO/WEB/TokenMagic/src/testable.ts)
  Pure logic exported for regression tests.
