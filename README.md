<div align="center">
  <h1>mindra</h1>
  <p><strong>Your interface knows what your user has already learned.</strong></p>
  <p>
    <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT" />
    <img src="https://img.shields.io/badge/gzipped-5.4_kB-4F46E5?style=flat-square" alt="5.4 kB gzipped" />
    <img src="https://img.shields.io/badge/runtime_dependencies-none-success?style=flat-square" alt="no runtime dependencies" />
    <img src="https://img.shields.io/badge/backend-not_required-success?style=flat-square" alt="no backend" />
    <a href="https://github.com/sidhanshumonga/mindra-dev/actions/workflows/ci.yml">
      <img src="https://github.com/sidhanshumonga/mindra-dev/actions/workflows/ci.yml/badge.svg" alt="CI" />
    </a>
  </p>
</div>

---

Every product ships the same interface to a first-time user and to someone who
has used it daily for three years. The usual fix is a scatter of booleans —
`hasSeenExportTooltip`, `dismissedOnboarding` — one per feature, never cleaned
up, with no notion of degree and no notion of struggle.

Mindra replaces them with one primitive: **how familiar is this user with this
specific element, right now?**

```tsx
const { expertise, friction, suggestion } = useAdaptive('export-btn')
```

No signup. No API key. No backend. Nothing leaves the browser.

## Install

```bash
npm install @mindra.dev/react
```

## Quick start

```tsx
import { AdaptiveProvider, Adaptive } from '@mindra.dev/react'

// 1. Wrap your app once
<AdaptiveProvider appId="my-app">{children}</AdaptiveProvider>

// 2. Let an element speak differently to people who know it
<Adaptive
  id="export"
  novice="Export this project as a PDF"
  expert="Export"
>
  <button>Export</button>
</Adaptive>
```

That is the whole setup. The runtime watches hovers, clicks, focus, hesitation
and abandonment, scores each element, and swaps the copy as familiarity grows.

## What you get back

```ts
const state = useAdaptive('export-btn')

{
  familiarity: 0.63,          // 0–1, rises asymptotically with use
  friction:    0.21,          // 0–1, from hesitation, abandonment and errors
  confidence:  0.50,          // (1 − friction) × familiarity
  expertise:  'proficient',   // novice | learning | proficient | expert
  suggestion: 'show_shortcut' // show_tutorial | inline_details | show_shortcut | silent
}
```

Branch on it however you like:

```tsx
const { expertise } = useAdaptive('delete-item')

const handleDelete = () => {
  if (expertise === 'novice') return openConfirmationModal()
  deleteNow()
  showUndoToast()          // experts get speed, with a way back
}
```

## How the scoring works

| Metric | Definition |
|---|---|
| Familiarity | `1 − e^(−clicks / λ)`, λ = 8 by default. Asymptotic, never quite reaches 1. |
| Hesitation | Time between pointer entering the element and activating it, clamped to 8s. |
| Friction | `0.4·hesitation + 0.4·abandonment + 0.2·errorRate` |
| Confidence | `(1 − friction) × familiarity` |

Tier thresholds sit at 0.28 / 0.58 / 0.85 familiarity. Tune λ via
`<AdaptiveProvider config={{ lambda: 12 }}>`.

## Tier variants

`<Adaptive>` resolves content in this order: the variant for the user's current
tier → AI-generated copy if you enabled it → `fallback` → the child untouched.

Variants walk *down* to the nearest one you supplied, so partial specification
behaves sensibly — give only `novice` and `expert`, and a proficient user keeps
the novice copy. The interface does not simplify until you say it may.

It also sets `data-adaptive-tier` on the element, so you can drive transitions
from your own stylesheet instead of having a library write inline styles.

## AI is optional

The engine is deterministic and needs no model. If you want copy generated
instead of hand-written, bring your own key — it is never proxied through us,
because there is no "us" in the request path.

```tsx
<AdaptiveProvider
  appId="my-app"
  ai={{ provider: 'ollama', endpoint: 'http://localhost:11434', model: 'llama3' }}
/>
```

Supported: `ollama`, `openai`, `gemini`, `window.ai`, a `custom` runner, or
`server` pointed at your own endpoint. Generated copy is cached per element and
tier, so a model is consulted once per variation, not once per interaction.

## Privacy

- **Collected:** interaction *timing and counts* only — hovers, clicks, focus,
  hesitation, abandonment, and errors you report. Never keystrokes, never input
  values, never page content.
- **Stored:** `localStorage`, under `mindra_stats_<appId>`, capped at 500
  elements with coldest-first eviction.
- **Transmitted:** nothing. There is no default network call. Data leaves the
  browser only if you pass your own `onSync` handler or enable a cloud AI
  provider.
- **Identifiers** derived from the DOM are scrubbed of emails, UUIDs, long
  hashes and digit runs before storage, so `order-1048577` is recorded as
  `order-#`.

You are still the data controller for your own site. If your jurisdiction
requires consent for non-essential local storage, gate `<AdaptiveProvider>`
behind it.

## What this does not do

Being direct about the edges, because they matter more than the features:

- **No cross-device identity.** State is per browser. The same person on a
  laptop and a phone is two independent learners.
- **No backend, dashboard or cohort analytics.** Bring your own `onSync` if you
  want aggregation.
- **It does not move your UI around.** Mindra emits state; you decide what
  changes. Only elements you explicitly wrap are ever touched.
- **Clicks are not comprehension.** A user who clicks the same button thirty
  times may be an expert or may be stuck. Read `friction` alongside
  `familiarity`.

## Packages

| Package | |
|---|---|
| [`@mindra.dev/core`](packages/core) | Framework-agnostic runtime, scoring, storage |
| [`@mindra.dev/react`](packages/react) | Provider, hooks, `<Adaptive>` |
| [`packages/extension`](packages/extension) | Chrome DevTools panel, declares no permissions |

## Contributing

```bash
npm install
npm test          # 55 tests, including assertions that the runtime makes no network calls
npm run build     # dual ESM/CJS, asserts the "use client" directive survives bundling
npm run typecheck
```

## License

MIT © Sidhanshu Monga
