# Example — an adaptive toolbar

A toolbar whose controls learn how well you know them, next to a live readout of
what the runtime believes about each one.

```bash
npm install       # from the repository root
npm run dev --workspace=examples/react-dashboard
```

Click around. Familiarity climbs, the copy shortens, and Delete stops asking for
confirmation once you have shown you know what it does. Everything is stored in
`localStorage`; no network requests are made.

`lambda` is set to `3` here so the curve is visible within a handful of clicks.
The default of `8` is the one you want in a real product.

## A note on layout

Adaptive copy changes an element's width, and a narrower button pulls its
neighbours leftward — under a cursor that has not moved. The toolbar here
reserves the width of the longest variant so only the text changes.

Adapt what an element *says* freely. Be far more careful about changing what it
*occupies*.
