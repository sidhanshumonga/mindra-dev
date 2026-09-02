# @mindra/react

Adapt copy, tooltips and confirmation flows to how familiar each user is with
each element of your interface. Local-first, no backend, no API key.

```bash
npm install @mindra/react
```

```tsx
import { AdaptiveProvider, Adaptive, useAdaptive } from '@mindra/react'

// Wrap your app once
<AdaptiveProvider appId="my-app">{children}</AdaptiveProvider>

// Then let an element speak differently to people who already know it
<Adaptive id="export" novice="Export this project as a PDF" expert="Export">
  <button>Export</button>
</Adaptive>

// Or branch on the state yourself
const { expertise, friction, suggestion } = useAdaptive('delete-item')
```

`useAdaptive` returns `familiarity`, `friction` and `confidence` as 0–1 numbers,
plus an `expertise` tier (`novice` → `expert`) and a `suggestion`
(`show_tutorial` → `silent`).

Interaction timing is stored in `localStorage` and never transmitted. AI-generated
copy is optional and bring-your-own-key.

Full documentation: **[github.com/sidhanshumonga/mindra-dev](https://github.com/sidhanshumonga/mindra-dev)**

MIT © Sidhanshu Monga
