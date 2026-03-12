# TokenMagic

TokenMagic is a Figma development plugin that scans selected components, finds matching local variables using a three-tier token path convention, optionally creates any missing component tokens from current raw values, and then binds everything in one pass.

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

## Expected token naming

Component tokens are matched against local variables whose full path follows:

`{CollectionName}/component/{ComponentName}/{variantSegments}/{variableName}`

Examples:

- `Semantic/component/Button/hover/bg`
- `Primitive/component/Card/hover/large/border`

Variant path segments are derived from component set child names such as `State=Hover, Size=Large`, which become `hover/large`. The pre-flight UI lets you exclude individual variant properties before missing variables are created.
