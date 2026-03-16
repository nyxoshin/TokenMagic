# TokenMagic Roadmap

This roadmap reflects the current shipped state of TokenMagic as of March 15, 2026.

TokenMagic is already past the prototype stage. It now has a working scan -> preview -> create/bind workflow, configurable scanning, live preview, conflict handling, effect support, and a growing automated regression suite.

The next phase is reliability: test harder, fix edge cases faster, and keep naming and path behavior predictable across messy real files.

## Shipped

### Core workflow

- scans selected components, component sets, and internal layers inside components
- proposes token paths automatically
- previews changes live in the UI
- creates missing variables
- binds existing or newly created variables back to Figma nodes

### Token domains

- `color`
- `typography`
- `device`

Current path behavior:

- default chain:
  - `base -> semantic -> component`
- icon colors:
  - `color/base -> color/semantic/icon/...`
- typography:
  - `typography/base -> typography/semantic/...`
- device semantics:
  - bucket-first paths like `device/semantic/stroke/avatar/club/sm/1`

### Scanning controls

- per-category scan scopes for:
  - `Colors`
  - `Typography`
  - `Device`
- scan modes:
  - `Selection only`
  - `Selection + internal layers`
  - `Selection + semantic internal layers`
- semantic classifier controls:
  - allowlist
  - denylist
- presets:
  - `General`
  - `Buttons`
  - `Icons`
  - `Form controls`
  - `Text only`
  - `Custom`

### Execution controls

- `Create and bind`
- `Create only`
- `Bind only`
- live preview column
- `Already bound` panel
- `Debug` panel
- UI window-size presets

### Conflict handling

- preflight conflict detection
- per-conflict actions:
  - `Skip`
  - `Reuse existing`
  - `Rename proposed`
  - `Create deeper semantic token`
- conflict chain-level labeling
- resolved path preview
- semantic fallback conflicts now default to the safe deeper semantic path instead of `skip`

### Existing-token compatibility

- exact-path matching for existing variables
- selection-independent fallback matching for shared component prefixes
- alias compatibility accepted when different alias chains resolve to the same final value

### Typography

Supported:

- `fontSize`
- `fontFamily`
- `fontWeight`
- `lineHeight`
- `letterSpacing`
- `paragraphSpacing`
- `paragraphIndent`

Current text behavior:

- mixed-range support in a first pass
- stable `text-range-N` suffixes
- percent-to-pixel conversion for:
  - `lineHeight`
  - `letterSpacing`
- no new variables for default-like text values such as `0` or `AUTO`

### Effects

Supported effect types:

- `DROP_SHADOW`
- `INNER_SHADOW`
- `LAYER_BLUR`
- `BACKGROUND_BLUR`

Supported effect fields:

- effect color
- effect radius
- effect spread
- effect offset X
- effect offset Y

Current behavior:

- effect color goes to `color`
- numeric effect fields go to `device`
- default-like zero effect values do not create new variables

### Safety rules

- skip full-opacity standalone tokens
- skip width and height for `HUG` and `FILL`
- skip zero-value creation for:
  - gap
  - padding
  - radius
  - stroke weight
- skip zero-value creation for text layout defaults:
  - `letterSpacing`
  - `paragraphSpacing`
  - `paragraphIndent`
- skip zero-value creation for effect defaults:
  - `effects.radius`
  - `effects.spread`
  - `effects.offsetX`
  - `effects.offsetY`
- skip `AUTO` line height
- only read padding and gap from auto-layout nodes
- ignore nested instances
- ignore selected layers inside nested instances
- stop traversal on:
  - masks
  - subtract / boolean wrappers

### Naming rules now in place

- singular collection naming:
  - `color`
  - `typography`
  - `device`
- stroke-related groups use `stroke`, not `border`
- duplicate leaves like `border/border` are collapsed
- scoped device semantic paths keep the semantic bucket first

### Testing foundation

- `npm run build`
- `npm test`
- extracted pure logic in:
  - `src/testable.ts`
- regression coverage for:
  - variant parsing
  - prefix hoisting
  - fallback candidate paths
  - token path normalization
  - typography conversion
  - mixed-range naming
  - effect path naming
  - default zero-value skips
  - stroke naming normalization
  - scoped device semantic ordering

## Current weak spots

### 1. Real-world paint support is still intentionally narrow

Current behavior:

- only single visible solid fills and strokes are tokenized

Still weak:

- multi-paint nodes
- layered icon paints
- more nuanced gradient policy
- image-paint strategy

### 2. Existing-system compatibility still needs wider regression testing

Current logic is much safer than before, but it still needs broader validation on:

- partially tokenized systems
- renamed semantic trees
- older files with inconsistent grouping
- files that already contain path shapes from earlier TokenMagic experiments

### 3. Semantic classification is still project-sensitive

Allowlist and denylist help, but the model is still intentionally simple.

Weak areas:

- names like `surface`, `container`, `content`
- icon internals like `primary` and `secondary`
- deciding when a named layer is meaningful vs structural

### 4. Rich text support is still a first pass

Mixed ranges work, but the next weak points are:

- naming quality for complex rich text
- grouping repeated spans
- very fragmented rich-text nodes
- deciding what should stay tokenized vs skipped

### 5. UI is functional, but still not settled

The current UI works, but still needs product refinement around:

- very dense long lists
- conflict editing ergonomics
- preview readability on large selections
- clearer distinction between create, bind, already-bound, and skip outcomes

## Next priorities

### Priority 1: Real Figma regression testing

Use [TESTING.md](/Users/Nikita/Desktop/Файлы/PORTFOLIO/WEB/TokenMagic/TESTING.md) against real files and turn repeated bugs into either:

- a code fix
- an automated regression test

This is still the highest-value work.

### Priority 2: Existing-token reliability pass

Improve behavior in partially structured token systems:

- stronger diagnostics for reuse decisions
- clearer chain-repair flows
- safer behavior when old alias trees and newer path rules meet

### Priority 3: Paint strategy beyond single solid paints

Define explicit policy for:

- multi-paint nodes
- icon layers with overlays
- gradients
- images

Not everything has to become supported, but behavior should be deliberate and clearly reported.

### Priority 4: Semantic classification refinement

Refine semantic vs structural rules for:

- icons
- masks
- boolean wrappers
- helper layers
- ambiguous names

This should reduce junk tokens without hiding useful internals.

### Priority 5: Rich text refinement

Improve mixed-range text behavior:

- better naming
- fewer awkward range-derived tokens
- clearer preview labeling

## Longer-term direction

### 1. Saved project settings

Persist:

- classifier settings
- default scan scopes
- presets
- execution preferences

### 2. Composite-token direction

Potential future candidates:

- typography composites
- border/stroke composites
- shadow composites

### 3. TokenMagic Pro split

The public MIT version should keep focusing on:

- reliability
- predictable token generation
- strong testing
- safe creation and binding

Future Pro work can focus on:

- saved project profiles
- migration/import flows
- advanced audits and reports
- smarter repair of existing systems
- batch and team workflows
