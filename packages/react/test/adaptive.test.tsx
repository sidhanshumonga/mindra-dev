// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { AdaptiveProvider, Adaptive, useAdaptive } from "../src/index";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("<Adaptive> content resolution", () => {
  it("shows the variant for the user's current tier", () => {
    expect(
      html(<Adaptive id="export" novice="Export this project as a PDF" expert="Export"><button>Export</button></Adaptive>)
    ).toContain("Export this project as a PDF");
  });

  it("walks down to the nearest supplied variant rather than showing nothing", () => {
    // only `expert` is defined; a novice must not be left with an empty label
    expect(
      html(<Adaptive id="x" expert="Export"><button>Original</button></Adaptive>)
    ).toContain("Original");
  });

  it("prefers developer copy over a fallback", () => {
    expect(
      html(<Adaptive id="x" novice="Tier copy" fallback="Fallback copy"><button>c</button></Adaptive>)
    ).toContain("Tier copy");
  });

  it("uses the fallback when no variant matches", () => {
    expect(html(<Adaptive id="x" fallback="Fallback copy"><button>c</button></Adaptive>)).toContain("Fallback copy");
  });

  it("leaves the child untouched when given no copy at all", () => {
    expect(html(<Adaptive id="x"><button>Original</button></Adaptive>)).toContain("Original");
  });

  it("sets a placeholder on inputs rather than children", () => {
    const out = html(<Adaptive id="search" novice="Search all projects"><input /></Adaptive>);
    expect(out).toContain('placeholder="Search all projects"');
  });
});

describe("<Adaptive> element contract", () => {
  it("tags the child so telemetry and adaptation refer to the same element", () => {
    expect(html(<Adaptive id="export"><button>x</button></Adaptive>)).toContain('data-adaptive-id="export"');
  });

  it("does not override an id the developer set themselves", () => {
    const out = html(<Adaptive id="export"><button data-adaptive-id="custom">x</button></Adaptive>);
    expect(out).toContain('data-adaptive-id="custom"');
    expect(out).not.toContain('data-adaptive-id="export"');
  });

  it("exposes the tier for stylesheet-driven transitions", () => {
    expect(html(<Adaptive id="x"><button>x</button></Adaptive>)).toContain('data-adaptive-tier="novice"');
  });

  it("renders visible, so content survives disabled or failed scripts", () => {
    const out = html(<Adaptive id="x" novice="Visible"><button>x</button></Adaptive>);
    expect(out).not.toContain("opacity");
  });

  it("preserves styles the consumer put on the child", () => {
    const out = html(<Adaptive id="x"><button style={{ color: "red" }}>x</button></Adaptive>);
    expect(out).toContain("color:red");
  });
});

describe("useAdaptive", () => {
  beforeEach(() => { localStorage.clear(); document.body.innerHTML = ""; });

  it("reports a guided novice before any history exists", () => {
    const Probe = () => {
      const s = useAdaptive("x");
      return <span>{`${s.expertise}|${s.suggestion}|${s.familiarity}`}</span>;
    };
    expect(html(<Probe />)).toContain("novice|show_tutorial|0");
  });

  it("picks up prior familiarity from storage after mount", async () => {
    localStorage.setItem(
      "mindra_stats_app",
      JSON.stringify({ export: { clicks: 40, hovers: 40, abandonments: 0, errors: 0, totalHesitation: 400 } })
    );

    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      createRoot(container).render(
        <AdaptiveProvider appId="app">
          <Adaptive id="export" novice="Export this project as a PDF" expert="Export">
            <button>Export</button>
          </Adaptive>
        </AdaptiveProvider>
      );
    });

    const btn = container.querySelector("button")!;
    expect(btn.getAttribute("data-adaptive-tier")).toBe("expert");
    expect(btn.textContent).toBe("Export");
  });
});
