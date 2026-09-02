# @mindra.dev/core

Framework-agnostic runtime for element-level user familiarity scoring. Local-first,
no runtime dependencies, no backend.

> Using React? Install [`@mindra.dev/react`](https://www.npmjs.com/package/@mindra.dev/react) instead — it wraps this package.

```bash
npm install @mindra.dev/core
```

```ts
import { MindraRuntime } from '@mindra.dev/core'

const mindra = new MindraRuntime({ appId: 'my-app' })

const state = mindra.getState('export-btn')
// { familiarity, friction, confidence, expertise, suggestion }

mindra.subscribe((elementId, state) => {
  if (state.expertise === 'expert') hideTooltip(elementId)
})
```

The runtime attaches passive listeners for hover, click and focus, derives a
stable identifier per element, and scores familiarity, friction and confidence
from the resulting interaction history. Everything is kept in `localStorage`;
nothing is transmitted unless you supply an `onSync` handler.

**Exports:** `MindraRuntime`, `MindraStorage`, `MindraTelemetry`,
`resolveElementPath`, `sanitizeElementId`, `calculateFamiliarity`,
`calculateFriction`, `calculateConfidence`, `determineExpertise`,
`determineSuggestion`, `evaluateElementState`, `executeAIPrompt`.

Full documentation: **[github.com/sidhanshumonga/mindra-dev](https://github.com/sidhanshumonga/mindra-dev)**

MIT © Sidhanshu Monga
