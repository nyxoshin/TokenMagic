# TokenMagic Testing

This file is the practical regression checklist for TokenMagic.

Use it in two layers:

1. fast logic checks
2. manual Figma runtime checks

## Automated checks

These are the checks we can run directly from the repo.

### Build

Run:

```bash
npm run build
```

Expected:

- TypeScript compiles
- the Figma UI bundle is rebuilt successfully

### Logic tests

Run:

```bash
npm test
```

Current automated coverage:

- variant parsing
- shared component-prefix logic
- candidate path fallback
- token path normalization
- semantic domain and subtype helpers
- typography leaf naming
- device bucket naming
- percent-to-px typography conversion
- default zero text-layout skips
- mixed text-range naming

These tests protect the pure logic that has caused the most regressions so far.

## Manual Figma regression

These checks still need to happen inside Figma because they depend on real plugin runtime behavior.

### 1. Basic selection

Test:

- no selection
- one component
- one component set
- one internal layer inside a component

Expected:

- no crash
- clear selection summary
- analysis loads correctly

### 2. Existing exact match reuse

Test:

- select a component whose token already exists exactly

Expected:

- item appears in `Ready to bind`
- confirm binds without creating duplicates

### 3. Selection-independent shared matching

Test:

- select one component that belongs to a family with existing shared tokens
- then select two siblings from that same family

Expected:

- both cases should resolve to the same existing shared tokens
- matching should not depend on sibling selection anymore

### 4. Shared-value hoisting

Test cases:

- all button variants share one height
- only `button/secondary` variants share one stroke weight
- only `button/fab` variants share one gap

Expected:

- values hoist only as far as the real common prefix
- no over-hoisting to `button` when only one subtype shares a value

### 5. Base / semantic / component chain

Test:

- run on a clean file with no variables

Expected:

- creates:
  - `colors`
  - `typography`
  - `device`
- each collection contains:
  - `base`
  - `semantic`
  - `component`
- component aliases semantic
- semantic aliases base

### 6. Color ladder

Test:

- one color at `100%`
- one state at `80%`
- one state at an unusual alpha like `8%`

Expected:

- base colors include the default ladder
- if `8` is introduced, every base color gets `/8`

### 7. Unsupported paint handling

Test:

- multi-fill node
- multi-stroke node
- gradient fill
- image fill

Expected:

- no guessing
- clear reasons in `Skipped / unsupported`

### 8. Text scalar properties

Test:

- `fontSize`
- `fontFamily`
- `fontWeight`
- `lineHeight`
- `letterSpacing`
- `paragraphSpacing`
- `paragraphIndent`

Expected:

- supported values become candidates
- valid bindings succeed

### 9. Text defaults and skips

Test:

- `AUTO` line height
- `letterSpacing = 0`
- `paragraphSpacing = 0`
- `paragraphIndent = 0`

Expected:

- they do not create tokens
- they appear as skipped only when relevant

### 10. Percent typography conversion

Test:

- percent line height
- percent letter spacing

Expected:

- plugin converts them to px using `fontSize * percent / 100`

### 11. Mixed text ranges

Test:

- one text node with two or more ranges using different:
  - font weight
  - font size
  - line height
  - letter spacing

Expected:

- separate range-level candidates are created
- range-level bindings apply to the correct spans
- range path suffixes are stable:
  - `text-range-1`
  - `text-range-2`

### 12. Conflict resolution

Test:

- existing path with different alias target but same final value
- existing path with different final value

Expected:

- same final value:
  - accepted as compatible
- different final value:
  - shown in `Conflicts`
- conflict actions work:
  - `Skip`
  - `Reuse existing`
  - `Rename proposed`
  - `Create deeper semantic token`

### 13. Execution modes

Test all four:

- `Create and bind`
- `Dry run`
- `Create only`
- `Bind only`

Expected:

- each mode does only what it says
- summary text matches the mode

### 14. Presets

Test:

- `General`
- `Buttons`
- `Icons`
- `Form controls`
- `Text only`

Expected:

- selecting a preset updates scan scopes, family toggles, and semantic lists
- changing a setting manually flips the preset to `Custom`

## Release gate

Before a public release, do not ship unless:

- `npm test` passes
- `npm run build` passes
- manual Figma regression passes for:
  - selection
  - chain creation
  - existing-token reuse
  - shared-value hoisting
  - conflicts
  - mixed text ranges
  - execution modes

## Recommended regression files

Keep one or more Figma files that cover:

- buttons
- icons
- form controls
- text-only components
- mixed rich text
- partially tokenized systems

Those files are more valuable than synthetic cases once the plugin is close to release.
