# TokenMagic

TokenMagic is a Figma development plugin that scans selected components and component sets, builds token chains for missing values, and binds variables back to the design.

The plugin targets a three-level token architecture:

`base -> semantic -> component`

and splits variables into three collections:

- `colors`
- `typography`
- `device`

Each collection is structured into:

- `base`
- `semantic`
- `component`

## What It Does

TokenMagic currently:

- reads selected `COMPONENT` and `COMPONENT_SET` nodes
- derives variant segments from Figma metadata and variant names
- scans supported color, typography, spacing, sizing, radius, stroke, and layout properties
- matches existing variables by exact path
- creates missing `base -> semantic -> component` chains
- reuses existing variables only when type and value match exactly
- binds the final component variable back to the Figma node
- hoists repeated identical values higher in the component hierarchy when possible
- supports creating missing base variables through a UI toggle

## Collections

### Colors

Color tokens are generated into:

- `colors/base`
- `colors/semantic`
- `colors/component`

Examples:

- `colors/base/color1/100`
- `colors/base/color1/80`
- `colors/base/color1/60`
- `colors/semantic/bg/action/primary/default`
- `colors/semantic/border/action/secondary/focus`
- `colors/component/button/primary/default/bg`

Rules:

- base colors are numbered as `colorN`
- the default opacity ladder is `100, 80, 60, 40, 20, 10, 0`
- if any extra opacity step is needed, the plugin should add that step to every base color
- semantic color naming is deeper than `bg/default` and is intended to express role plus domain, for example `bg/action/primary/default`
- semantic color tokens alias base color tokens
- component color tokens alias semantic color tokens

### Typography

Typography tokens are generated into:

- `typography/base`
- `typography/semantic`
- `typography/component`

Examples:

- `typography/base/font-size/17`
- `typography/base/font-family/tektur`
- `typography/base/font-weight/600`
- `typography/semantic/label/font-size`
- `typography/component/button/label/font-size`

### Device

Layout and numeric device-style tokens are generated into:

- `device/base`
- `device/semantic`
- `device/component`

Examples:

- `device/base/size/8`
- `device/base/size/16`
- `device/base/size/60`
- `device/semantic/gap/8`
- `device/semantic/radius/0`
- `device/semantic/height/60`
- `device/component/button/height`

Rules:

- `device/base` is a shared numeric size pool and should not be split by semantic category
- semantic device variables alias shared base sizes
- component device variables alias semantic device variables

## Alias Chain

When the plugin creates missing variables, it builds this chain:

- `component -> semantic -> base`

That means:

- component variables are the ones bound to Figma nodes
- semantic variables alias base variables
- component variables alias semantic variables

## Current Property Coverage

The plugin currently scans and can create/bind tokens for:

- fill color
- stroke color
- stroke weight
- opacity
- width
- height
- top-left, top-right, bottom-left, bottom-right radius
- padding top, right, bottom, left
- item spacing
- font size
- font family
- font weight

## Important Rules

- Full opacity is skipped as a standalone variable.
- Fill alpha is stored inside the color token.
- Width and height are skipped when the node uses `HUG` sizing on that axis.
- Nested `INSTANCE` nodes are ignored.
- Matching uses exact token paths only.
- Existing variables are reused only when type and value match exactly.
- If an existing variable path conflicts with the expected alias chain, the plugin surfaces a conflict instead of silently reusing the wrong variable.

## Shared Value Hoisting

If related components or variants share the same value for the same property, TokenMagic can hoist that token higher in the hierarchy instead of duplicating it.

Examples:

- shared across all button variants:
  `device/component/button/height`
- shared across secondary button variants only:
  `device/component/button/secondary/stroke-weight`
- shared across FAB variants only:
  `device/component/button/fab/gap`

## Project structure

- `src/code.ts` contains all Figma API access, token generation, matching logic, variable creation, alias-chain creation, and binding.
- `src/ui.html` contains the full plugin UI in vanilla JavaScript.
- `dist/` contains the compiled plugin output used by Figma.
- `manifest.json` points Figma at the built files and enables `documentAccess: "dynamic-page"`.

## Local development

1. Install dependencies with `npm install`.
2. Build the plugin with `npm run build`.
3. In Figma desktop, open `Plugins` -> `Development` -> `Import plugin from manifest...`.
4. Select [`manifest.json`](/Users/Nikita/Desktop/Файлы/PORTFOLIO/WEB/TokenMagic/manifest.json).
5. Run `TokenMagic` from the Development plugins list.

## Usage

1. Select a component or a full component set in Figma.
2. Run `TokenMagic` from the Development plugins list.
3. Review the pre-flight panel:
   - `Ready to bind` shows exact existing matches
   - `Unmatched` shows editable `base`, `semantic`, and `component` paths
4. Choose whether the plugin is allowed to create missing base variables.
5. Confirm to create missing variables and bind them.

## Settings Direction

The current UI supports a base creation toggle. The intended direction is:

- editable naming for generated token paths
- conflict resolution UI only when a real chain conflict exists
- deeper semantic naming for project-specific meaning when needed

## Variant Handling

Variant path segments are derived from component-set metadata when available, with name-based fallbacks for formats such as:

- `State=Hover, Size=Large`
- `Hover, Large`
- `Hover`
