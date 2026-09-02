# Mindra DevTools

A Chrome DevTools panel that shows what the Mindra runtime believes about each
element on the page you are inspecting.

## Install

```bash
npm install          # from the repository root
npm run build --workspace=packages/extension
```

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**,
and select this directory. A **Mindra** tab appears in DevTools.

## Permissions

None. The manifest declares no `permissions`, no `host_permissions`, and no
content scripts.

The panel reads the inspected page through
`chrome.devtools.inspectedWindow.eval`, which is already scoped to the tab you
have DevTools open on. It never injects a script into pages you browse, never
runs while DevTools is closed, and never writes to the inspected page's storage.

## What it shows

Familiarity, friction and confidence per element, the derived expertise tier,
and the underlying signals — activations, hovers, average hesitation before
activating, hover-then-abandon rate, and reported errors.

The scores come from `@mindra.dev/core` itself, bundled into the panel at build
time, so what you see here is exactly what `useAdaptive` returns in your app.

## Scope

The panel inspects pages that already run the Mindra runtime; it reads the
`*_stats_*` state the SDK persists. On a page without Mindra it reports that no
runtime was detected rather than tracking the page itself.
