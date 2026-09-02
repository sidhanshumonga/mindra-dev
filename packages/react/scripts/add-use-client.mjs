/**
 * Re-adds the "use client" directive to the built bundles.
 *
 * The source carries the directive, but bundlers treat a leading string literal
 * as a droppable expression statement and strip it. Without it every Next.js
 * App Router consumer hits a server-component error the moment they import a
 * hook, so this is asserted at build time rather than trusted to the bundler.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIRECTIVE = '"use client";';
const targets = ["dist/index.js", "dist/index.cjs"];

for (const rel of targets) {
  const file = join(process.cwd(), rel);
  const source = readFileSync(file, "utf8");

  if (source.startsWith(DIRECTIVE) || source.startsWith("'use client';")) continue;

  // CJS output opens with its own "use strict" directive; the client directive
  // has to sit in the same leading prologue, not above it.
  const updated = source.startsWith("'use strict';")
    ? source.replace("'use strict';", `'use strict';${DIRECTIVE}`)
    : DIRECTIVE + source;

  writeFileSync(file, updated);
}

for (const rel of targets) {
  const source = readFileSync(join(process.cwd(), rel), "utf8");
  if (!source.slice(0, 64).includes("use client")) {
    throw new Error(`Build failed: "use client" missing from ${rel}`);
  }
}

console.log('✓ "use client" present in', targets.join(", "));
