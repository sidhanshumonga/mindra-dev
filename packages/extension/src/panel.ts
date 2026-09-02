import { evaluateElementState, type ElementStats, type AdaptiveState } from "@mindra.dev/core";

/**
 * Reads Mindra's state out of the inspected page.
 *
 * This runs through `chrome.devtools.inspectedWindow.eval`, which is scoped to
 * the tab the developer already has DevTools open on. That is why the extension
 * declares no permissions at all: it needs no content script, no host access,
 * and it never writes to the inspected page.
 */
const READER = `(() => {
  const stores = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || key.indexOf("_stats_") === -1) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      if (parsed && typeof parsed === "object") stores[key] = parsed;
    } catch (e) { /* not ours, or not JSON */ }
  }
  return {
    stores,
    tagged: document.querySelectorAll("[data-adaptive-id]").length
  };
})()`;

interface PageSnapshot {
  stores: Record<string, Record<string, ElementStats>>;
  tagged: number;
}

interface Row {
  elementId: string;
  appId: string;
  stats: ElementStats;
  state: AdaptiveState;
}

let selectedId: string | null = null;
let rows: Row[] = [];

const $ = (id: string) => document.getElementById(id)!;
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Single source of truth for tier colour, matching the core thresholds. */
function tierColor(tier: AdaptiveState["expertise"]): string {
  return {
    novice: "var(--novice-color)",
    learning: "var(--learning-color)",
    proficient: "var(--accent-color)",
    expert: "var(--expert-color)",
  }[tier];
}

/**
 * What the developer should do about this element, derived from the runtime's
 * own suggestion rather than a lookup table keyed on element name — the old
 * panel only had advice for four hardcoded ids.
 */
function adaptationAdvice(state: AdaptiveState): string {
  const base: Record<AdaptiveState["suggestion"], string> = {
    show_tutorial: "Explain this control in full. The user has no history with it.",
    inline_details: "Keep the explanation, shorten it. Recognition is forming.",
    show_shortcut: "Trade the explanation for a shortcut hint.",
    silent: "Get out of the way. Any guidance here is now noise.",
  };
  if (state.friction > 0.5) {
    return `${base[state.suggestion]} Friction is high (${pct(state.friction)}) — check for hesitation or errors before simplifying further.`;
  }
  return base[state.suggestion];
}

function render(snapshot: PageSnapshot): void {
  rows = Object.entries(snapshot.stores).flatMap(([storeKey, elements]) => {
    const appId = storeKey.replace(/^.*_stats_/, "");
    return Object.entries(elements).map(([elementId, stats]) => ({
      elementId,
      appId,
      stats,
      state: evaluateElementState(elementId, stats),
    }));
  });

  rows.sort((a, b) => b.state.familiarity - a.state.familiarity);

  const status = $("status-text");
  if (rows.length === 0) {
    status.textContent =
      snapshot.tagged > 0
        ? `${snapshot.tagged} tagged elements, no history yet`
        : "No Mindra runtime detected on this page";
  } else {
    const apps = new Set(rows.map((r) => r.appId));
    status.textContent = `${rows.length} elements tracked · ${[...apps].join(", ")}`;
  }

  renderList();
  if (selectedId) renderDetails(selectedId);
}

function renderList(): void {
  const list = $("elements-list");
  list.textContent = "";

  if (rows.length === 0) {
    const li = document.createElement("li");
    li.style.cssText = "padding:12px;text-align:center;color:var(--text-secondary)";
    li.textContent = "No elements tracked yet.";
    list.appendChild(li);
    return;
  }

  for (const row of rows) {
    const li = document.createElement("li");
    li.className = `element-item${selectedId === row.elementId ? " active" : ""}`;
    li.onclick = () => selectElement(row.elementId);

    const wrapper = document.createElement("div");
    wrapper.className = "element-name-wrapper";

    const dot = document.createElement("span");
    dot.className = "status-dot";
    dot.style.backgroundColor = tierColor(row.state.expertise);

    const name = document.createElement("span");
    name.className = "element-name";
    name.textContent = row.elementId;
    name.title = row.elementId;

    wrapper.append(dot, name);

    const meta = document.createElement("span");
    meta.className = "element-meta";
    meta.textContent = `${row.stats.clicks || 0} evt`;

    li.append(wrapper, meta);
    list.appendChild(li);
  }
}

function selectElement(id: string): void {
  selectedId = id;
  $("empty-state").style.display = "none";
  $("inspector-content").style.display = "block";
  renderList();
  renderDetails(id);
}

function renderDetails(id: string): void {
  const row = rows.find((r) => r.elementId === id);
  if (!row) return;

  const { state, stats } = row;

  $("el-name").textContent = id;

  const tier = $("el-tier");
  tier.className = `details-tier tier-${state.expertise}`;
  tier.textContent = state.expertise;

  $("val-familiarity").textContent = pct(state.familiarity);
  const famBar = $("bar-familiarity");
  famBar.style.width = pct(state.familiarity);
  famBar.style.backgroundColor = tierColor(state.expertise);

  $("val-friction").textContent = pct(state.friction);
  const fricBar = $("bar-friction");
  fricBar.style.width = pct(state.friction);
  fricBar.style.backgroundColor =
    state.friction > 0.5 ? "var(--novice-color)" : "var(--accent-color)";

  $("adaptation-text").textContent = adaptationAdvice(state);

  const signals = $("signals-list");
  signals.textContent = "";

  const hovers = stats.hovers || 0;
  const clicks = stats.clicks || 0;
  const avgHesitation = clicks > 0 ? Math.round((stats.totalHesitation || 0) / clicks) : 0;
  const abandonRate = hovers > 0 ? Math.round(((stats.abandonments || 0) / hovers) * 100) : 0;

  const lines: Array<[string, boolean]> = [
    [`Confidence: ${pct(state.confidence)}`, true],
    [`Activations: ${clicks} · hovers: ${hovers}`, true],
    [`Average hesitation before activating: ${avgHesitation}ms`, clicks > 0],
    [`Hovered then abandoned: ${stats.abandonments || 0} of ${hovers} (${abandonRate}%)`, hovers > 0],
    [`Errors reported: ${stats.errors || 0}`, true],
    [`Suggestion: ${state.suggestion}`, true],
  ];

  for (const [text, prominent] of lines) {
    const li = document.createElement("li");
    li.textContent = `• ${text}`;
    li.style.color = prominent ? "var(--text-color)" : "var(--text-secondary)";
    signals.appendChild(li);
  }
}

function poll(): void {
  chrome.devtools.inspectedWindow.eval<PageSnapshot>(READER, (result, exception) => {
    if (exception || !result) {
      $("status-text").textContent = "Cannot read this page";
      return;
    }
    render(result);
  });
}

setInterval(poll, 500);
poll();
