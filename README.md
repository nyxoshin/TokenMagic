# TokenMagic

TokenMagic is a Figma development plugin that scans selected components and component sets, matches them against local variables using a component-token naming convention, optionally creates missing variables from live node values, and then binds them in one pass.

The plugin is built for a three-tier token structure:

`base -> semantic -> component`

Every component token is expected to live under a path like:

`{CollectionName}/component/{ComponentName}/{variantSegments}/{variableName}`

Examples:

- `Semantic/component/button/hover/bg`
- `Primitive/component/card/hover/large/border`
- `Semantic/component/button/height`

## What It Does

TokenMagic currently:

- indexes all local variables whose path contains `/component/`
- reads selected `COMPONENT` and `COMPONENT_SET` nodes
- derives variant segments from Figma variant metadata and child names
- scans bindable visual and layout properties
- shows a pre-flight UI with matched and unmatched properties
- creates missing variables from raw node values
- binds created or matched variables back to nodes
- hoists repeated identical values to a higher shared component family level when possible

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

Notes:

- Full opacity is skipped. The plugin does not create a separate opacity variable for `100%`.
- Fill alpha is stored inside the color token itself.
- Width and height are skipped when the node uses `HUG` sizing on that axis.
- Nested `INSTANCE` nodes are ignored.
- Matching uses exact token paths only.

## Shared Value Hoisting

If related components share the same family prefix and the same property value, TokenMagic can hoist that variable to a higher level instead of duplicating it for each variant or subtype.

Example:

- `button/primary/default`
- `button/primary/hover`
- `button/secondary/default`
- `button/secondary/hover`

If all four use `height = 60`, the plugin can propose:

- `Semantic/component/button/height`

instead of four separate per-variant height tokens.

## Project structure

- `src/code.ts` contains all Figma API access, matching logic, variable creation, and binding.
- `src/ui.html` contains the full pre-flight UI and summary screen in vanilla JavaScript.
- `dist/` is the compiled plugin output used by Figma after running the build.
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
   - `Ready to bind` shows exact token matches
   - `Unmatched` shows editable proposed paths for missing variables
4. Confirm to create missing variables and bind them.

## Expected Naming Behavior

By default, TokenMagic tries to keep names practical:

- component root background -> `bg`
- text-related fields on named layers -> `label/font-size`, `label/font-family`, `label/font-weight`
- spacing values can collapse to shared names like `padding`, `padding-horizontal`, `padding-vertical`
- shared values across related components can hoist to a family-level path like `button/height`

Variant path segments are derived from component-set metadata when available, with name-based fallbacks for cases such as:

- `State=Hover, Size=Large`
- `Hover, Large`
- `Hover`
