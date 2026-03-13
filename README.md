# TokenMagic

TokenMagic is a Figma plugin for building a design system from scratch or connecting new components to existing tokens with automatic variable-chain creation.

It generates and binds a three-level token architecture:

`base -> semantic -> component`

across three collections:

- `colors`
- `typography`
- `device`

## What it does

TokenMagic can:

- read selected components, component sets, and internal layers inside components
- derive variant segments from Figma component-set metadata
- scan color, typography, spacing, radius, size, border, and opacity properties
- match existing local variables by exact path
- create missing token chains
- bind component-level variables back to the selected nodes
- hoist repeated identical values higher in the component hierarchy when safe
- surface skipped items, unsupported items, and conflicts before writing

## Token structure

Each collection is organized into:

- `base`
- `semantic`
- `component`

The alias chain is:

- `component -> semantic -> base`

Examples:

- `colors/base/color1/100`
- `colors/semantic/bg/action/primary/default`
- `colors/component/button/primary/default/bg`
- `typography/base/font-size/17`
- `typography/component/button/label/font-size`
- `device/base/size/16`
- `device/semantic/gap/16`
- `device/component/button/height`

## Collections

### Colors

Color tokens are created in:

- `colors/base`
- `colors/semantic`
- `colors/component`

Rules:

- base colors are numbered as `colorN`
- the default opacity ladder is:
  - `100`
  - `80`
  - `60`
  - `40`
  - `20`
  - `10`
  - `0`
- if a new opacity step is needed for one base color, that same step is propagated across all base colors

### Typography

Typography tokens are created in:

- `typography/base`
- `typography/semantic`
- `typography/component`

Current typography fields:

- `fontSize`
- `fontFamily`
- `fontWeight`
- `lineHeight`
- `letterSpacing`
- `paragraphSpacing`
- `paragraphIndent`

### Device

Device-style numeric tokens are created in:

- `device/base`
- `device/semantic`
- `device/component`

Rules:

- `device/base` uses one shared numeric size pool
- semantic device tokens alias shared base sizes
- component device tokens alias semantic device tokens

## Supported properties

TokenMagic currently scans and can create or bind tokens for:

- fill color
- stroke color
- stroke weight
- opacity
- width
- height
- top-left radius
- top-right radius
- bottom-left radius
- bottom-right radius
- padding top
- padding right
- padding bottom
- padding left
- item spacing
- font size
- font family
- font weight
- line height
- letter spacing
- paragraph spacing
- paragraph indent

## Scan controls

TokenMagic supports per-category scan scopes for:

- `Colors`
- `Typography`
- `Device`

Available scan modes:

- `Selection only`
- `Selection + internal layers`
- `Selection + semantic internal layers`

Semantic internal-layer mode is controlled by:

- `Semantic allowlist`
- `Semantic denylist`

## Property-family toggles

You can enable or disable scanning for:

- `Colors`
- `Typography`
- `Spacing`
- `Radius`
- `Size`
- `Border`
- `Opacity`

## Component presets

The plugin ships with presets that stamp sensible defaults into scan scopes, family toggles, and semantic classifier settings:

- `General`
- `Buttons`
- `Icons`
- `Form controls`
- `Text only`
- `Custom`

## Execution modes

TokenMagic supports four execution modes:

- `Create and bind`
- `Dry run`
- `Create only`
- `Bind only`

Use these to preview or stage work safely when integrating into an existing variable system.

## Conflict handling

When an existing variable path conflicts with the expected chain, TokenMagic surfaces that conflict before writing.

Current conflict actions:

- `Skip`
- `Reuse existing`
- `Rename proposed`
- `Create deeper semantic token`

The conflict panel also shows the conflicting chain level and the final resolved path preview.

## Skip and safety rules

Current built-in safety rules:

- standalone opacity is skipped when it is fully opaque
- width and height are skipped when the node uses `HUG` or `FILL`
- zero-value creation is skipped for:
  - gap
  - padding
  - radius
  - stroke weight
- zero-value text layout creation is skipped for:
  - `letterSpacing`
  - `paragraphSpacing`
  - `paragraphIndent`
- `AUTO` line height does not create a token
- nested `INSTANCE` nodes are ignored
- existing variables are only reused when the fit is exact and safe

## Unsupported handling

The plugin explicitly reports unsupported cases instead of silently guessing.

Current unsupported cases include:

- multiple visible fills
- multiple visible strokes
- gradients
- image paints
- text values that still cannot be resolved safely from mixed ranges

## Shared-value hoisting

If related components or variants share the same value for the same property, TokenMagic can hoist that token higher in the component hierarchy.

Examples:

- shared across all button variants:
  - `device/component/button/height`
- shared across secondary variants only:
  - `device/component/button/secondary/stroke-weight`
- shared across FAB variants only:
  - `device/component/button/fab/gap`

## Project structure

- [src/code.ts](/Users/Nikita/Desktop/Файлы/PORTFOLIO/WEB/TokenMagic/src/code.ts)
  Figma API logic, matching, creation, hoisting, conflict handling, and binding.
- [src/ui.html](/Users/Nikita/Desktop/Файлы/PORTFOLIO/WEB/TokenMagic/src/ui.html)
  Plugin UI markup and vanilla JavaScript.
- [src/ui.css](/Users/Nikita/Desktop/Файлы/PORTFOLIO/WEB/TokenMagic/src/ui.css)
  Plugin UI styles.
- [scripts/build-ui.mjs](/Users/Nikita/Desktop/Файлы/PORTFOLIO/WEB/TokenMagic/scripts/build-ui.mjs)
  Inlines CSS and the custom wordmark font into the final Figma UI bundle.
- [manifest.json](/Users/Nikita/Desktop/Файлы/PORTFOLIO/WEB/TokenMagic/manifest.json)
  Figma plugin manifest.

## Mixed text ranges

TokenMagic now supports first-pass mixed-range text tokenization for:

- `fontSize`
- `fontFamily`
- `fontWeight`
- `lineHeight`
- `letterSpacing`
- `paragraphSpacing`
- `paragraphIndent`

When a text node contains multiple styled spans:

- the plugin can create separate range-level candidates
- bind them back with `setRangeBoundVariable`
- use stable range path suffixes like:
  - `text-range-1`
  - `text-range-2`

The UI still shows a readable preview label for each range.

## Local development

1. Install dependencies with `npm install`.
2. Build the plugin with `npm run build`.
3. In Figma desktop, open `Plugins` -> `Development` -> `Import plugin from manifest...`.
4. Select [manifest.json](/Users/Nikita/Desktop/Файлы/PORTFOLIO/WEB/TokenMagic/manifest.json).
5. Run `TokenMagic` from the Development plugins list.

## Usage

1. Select a component, component set, or internal layer inside a component.
2. Run `TokenMagic`.
3. Choose a component preset if needed.
4. Adjust scan scopes, semantic classifier settings, and property-family toggles.
5. Pick an execution mode.
6. Review:
   - `Ready to bind`
   - `Unmatched`
   - `Conflicts`
   - `Skipped / unsupported`
7. Confirm to run the selected action.

## Roadmap

See [ROADMAP.md](/Users/Nikita/Desktop/Файлы/PORTFOLIO/WEB/TokenMagic/ROADMAP.md) for the current shipped status and next priorities.
