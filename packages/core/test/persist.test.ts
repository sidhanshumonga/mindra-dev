// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MindraStorage } from "../src/storage";
import type { ElementStats } from "../src/types";

const stats = (over: Partial<ElementStats> = {}): ElementStats => ({
  clicks: 0, hovers: 0, abandonments: 0, errors: 0, totalHesitation: 0, ...over,
});

describe("onPersist", () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it("hands over settled state, not raw events", () => {
    const onPersist = vi.fn();
    const s = new MindraStorage("app", undefined, undefined, onPersist);

    s.updateStats("export", (p) => ({ ...p, clicks: 3 }));
    vi.advanceTimersByTime(600);

    expect(onPersist).toHaveBeenCalledOnce();
    expect(onPersist.mock.calls[0][0].export.clicks).toBe(3);
  });

  it("coalesces, so a burst of interaction is one write", () => {
    const onPersist = vi.fn();
    const s = new MindraStorage("app", undefined, undefined, onPersist);

    for (let i = 0; i < 50; i++) s.updateStats("export", (p) => ({ ...p, clicks: p.clicks + 1 }));
    vi.advanceTimersByTime(600);

    expect(onPersist).toHaveBeenCalledOnce();
    expect(onPersist.mock.calls[0][0].export.clicks).toBe(50);
  });

  it("stays quiet when a flush changes nothing", () => {
    const onPersist = vi.fn();
    const s = new MindraStorage("app", undefined, undefined, onPersist);

    s.updateStats("export", (p) => ({ ...p, clicks: 1 }));
    s.flush();
    s.flush();
    s.flush();

    expect(onPersist).toHaveBeenCalledOnce();
  });

  // Loading a profile must not immediately write it straight back out.
  it("does not echo hydrated state back to the consumer", () => {
    const onPersist = vi.fn();
    const s = new MindraStorage("app", undefined, undefined, onPersist);

    s.hydrate({ export: stats({ clicks: 40 }) });
    vi.advanceTimersByTime(600);

    expect(onPersist).not.toHaveBeenCalled();
  });

  it("persists again once the user interacts after hydrating", () => {
    const onPersist = vi.fn();
    const s = new MindraStorage("app", undefined, undefined, onPersist);

    s.hydrate({ export: stats({ clicks: 40 }) });
    vi.advanceTimersByTime(600);
    s.updateStats("export", (p) => ({ ...p, clicks: p.clicks + 1 }));
    vi.advanceTimersByTime(600);

    expect(onPersist).toHaveBeenCalledOnce();
    expect(onPersist.mock.calls[0][0].export.clicks).toBe(41);
  });

  it("survives a handler that throws", () => {
    const onPersist = vi.fn(() => { throw new Error("your api is down"); });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = new MindraStorage("app", undefined, undefined, onPersist);

    s.updateStats("export", (p) => ({ ...p, clicks: 1 }));
    expect(() => s.flush()).not.toThrow();
    // local storage still worked despite the consumer failing
    expect(JSON.parse(localStorage.getItem("mindra_stats_app")!).export.clicks).toBe(1);
    warn.mockRestore();
  });
});
