# TokenMagic Roadmap

This roadmap reflects the current shipped state of TokenMagic as of March 13, 2026.

The plugin is past the prototype stage. It now has a real token-generation workflow, configurable scanning, conflict handling, execution modes, and component presets. The remaining work is mostly about reliability, broader property support, and polish across more design-system files.

## Shipped

### Token architecture

- `colors`, `typography`, and `device` collections
- `base -> semantic -> component` alias chain generation
- shared `device/base/size/*` numeric pool
- base color numbering with shared opacity ladder propagation
- exact-path matching for existing variables

### Selection and scanning

- supports:
  - selected `COMPONENT`
  - selected `COMPONENT_SET`
  - selected internal layers inside components
- variant parsing from Figma metadata with name-based fallbacks
- per-category scan scopes:
  - `Selection only`
  - `Selection + internal layers`
  - `Selection + semantic internal layers`
- property-family toggles:
  - `Colors`
  - `Typography`
  - `Spacing`
  - `Radius`
  - `Size`
  - `Border`
  - `Opacity`
- semantic classifier settings:
  - allowlist
  - denylist
- component presets:
  - `General`
  - `Buttons`
  - `Icons`
  - `Form controls`
  - `Text only`
  - `Custom`

### Creation and binding

- creation of missing token chains
- safe reuse by exact type and exact value
- shared-value hoisting across variants and related component branches
- conflict preflight with per-item actions:
  - `Skip`
  - `Reuse existing`
  - `Rename proposed`
  - `Create deeper semantic token`
- resolved-path preview in the conflict UI

### Execution safety

- execution modes:
  - `Create and bind`
  - `Dry run`
  - `Create only`
  - `Bind only`
- skipped / unsupported reporting
- nested `INSTANCE` nodes ignored
- standalone opacity skipped at full opacity
- width / height skipped for `HUG` and `FILL`
- zero-value creation skipped for gap, padding, radius, and stroke weight

### Unsupported handling

- explicit skip reasons for:
  - multiple visible fills
  - multiple visible strokes
  - gradients
  - image paints
  - unresolved text values that still cannot be tokenized safely

### Typography

- supports:
  - `fontSize`
  - `fontFamily`
  - `fontWeight`
  - `lineHeight`
  - `letterSpacing`
  - `paragraphSpacing`
  - `paragraphIndent`
- supports first-pass mixed-range text binding for those fields
- percent-based `lineHeight` and `letterSpacing` are converted to pixels when a numeric font size is available
- stable mixed-range token suffixes:
  - `text-range-1`
  - `text-range-2`
- zero/default text layout creation skipped for:
  - `letterSpacing = 0`
  - `paragraphSpacing = 0`
  - `paragraphIndent = 0`
- `AUTO` line height skipped

## Current limitations

### 1. Paint support is intentionally narrow

Current behavior:

- only single visible solid fills and strokes are tokenized

Still missing:

- multi-paint token strategies
- gradient token handling
- image token handling
- better rules for overlays and effect-like paints

### 2. Typography support is still partial

Current behavior:

- supports:
  - the main scalar text fields
  - first-pass mixed-range text binding

Still missing:

- future composite typography tokens
- more robust naming for mixed text ranges
- richer rules for deciding when a text property is “default” and should stay out of tokens
- broader testing on long, complex rich-text nodes

### 3. Existing-system compatibility needs broader testing

Current behavior:

- exact reuse is predictable and safe

Still missing:

- more nuanced reuse in partially structured systems
- better recovery when semantic/base chains already exist with different alias structures
- more validation against large real-world variable libraries

### 4. Semantic classification is configurable, but still simple

Current behavior:

- allowlist / denylist exists
- presets seed useful defaults

Still missing:

- project-level saved classifier profiles
- richer matching for nested naming conventions
- better treatment of ambiguous names like:
  - `surface`
  - `container`
  - `content`
  - `primary`

### 5. UI still needs one more product pass

Current behavior:

- settings, queues, conflicts, skips, and execution modes are all in place

Still missing:

- tighter list density
- cleaner empty states
- more compact conflict editing
- stronger visual system consistency

## Next priorities

### Priority 1: Refine mixed-range typography

Add:

- better naming rules for mixed text ranges
- safer grouping of repeated styled spans
- clearer UI labeling for range-derived tokens

Why:

- the functionality exists now, but naming and ergonomics still need refinement

### Priority 2: Better existing-system compatibility

Add:

- smarter reuse diagnostics
- clearer chain-repair flows
- stronger rerun behavior in partially tokenized files

Why:

- real adoption depends on safe behavior in files that already contain variables

### Priority 3: Paint strategy beyond single solid paints

Add:

- explicit policy for multi-paint nodes
- future gradient/image strategies
- clearer rules for color-only scanning inside shape-heavy/icon-heavy components

Why:

- this is the biggest remaining gap in color coverage

### Priority 4: Persist project settings

Add:

- saved semantic allow / deny lists
- saved default presets
- saved execution-mode preference

Why:

- current settings are powerful, but still session-oriented

### Priority 5: Finalize product UI

Add:

- denser operational layout
- better queue readability
- clearer distinction between create, bind, and dry-run flows

Why:

- the workflow is strong enough now that UI polish will pay off directly

## Corner cases still worth solving

### Colors

- components with overlays plus base fills
- vectors/icons that should expose color but not geometry
- alpha ladder verification across repeated reruns

### Typography

- naming quality for mixed text ranges
- text-only component presets with richer defaults

### Device

- clearer handling for structural geometry versus semantic layout parts
- better grouping for icon or illustration components

### Selection model

- mixed internal-layer selection across multiple owning components
- clearer ownership/variant context in the UI

## DTCG-aligned direction

Useful references:

- https://www.designtokens.org/
- https://www.designtokens.org/tr/drafts/format/

TokenMagic is already aligned in a few important ways:

- aliases are first-class through `component -> semantic -> base`
- grouping is tool-defined and opinionated by workflow
- future composite tokens make sense for:
  - typography
  - border
  - shadow

The main remaining DTCG-related work is not format alignment. It is making the plugin’s scanning and creation policies more expressive without turning them into hidden heuristics.
