// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MindraRuntime } from "../src/index";

let runtime: MindraRuntime | null = null;

const fire = (el: Element, type: string, init: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));

describe("MindraRuntime privacy guarantees", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network disallowed"))));
  });

  afterEach(() => {
    runtime?.destroy();
    runtime = null;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("makes no network request on the default configuration", async () => {
    vi.useFakeTimers();
    runtime = new MindraRuntime({ appId: "app" });

    document.body.innerHTML = `<button data-adaptive-id="export">Export</button>`;
    const btn = document.querySelector("button")!;
    for (let i = 0; i < 20; i++) {
      fire(btn, "mouseover");
      fire(btn, "click");
      fire(btn, "mouseout");
    }
    await vi.advanceTimersByTimeAsync(30_000);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("leaves onSync and ai unset unless the consumer asks for them", () => {
    runtime = new MindraRuntime({ appId: "app" });
    expect((runtime as any).config.onSync).toBeUndefined();
    expect((runtime as any).config.ai).toBeUndefined();
  });

  it("does not accumulate an event buffer that nothing will drain", () => {
    runtime = new MindraRuntime({ appId: "app" });
    document.body.innerHTML = `<button data-adaptive-id="x">x</button>`;
    const btn = document.querySelector("button")!;
    for (let i = 0; i < 50; i++) fire(btn, "click");

    expect((runtime as any).eventBuffer).toHaveLength(0);
  });

  it("hands events to a consumer-supplied onSync instead", async () => {
    vi.useFakeTimers();
    const onSync = vi.fn(async () => {});
    runtime = new MindraRuntime({ appId: "app", onSync, syncInterval: 1000 });

    document.body.innerHTML = `<button data-adaptive-id="x">x</button>`;
    fire(document.querySelector("button")!, "click");
    await vi.advanceTimersByTimeAsync(1500);

    expect(onSync).toHaveBeenCalledOnce();
    expect(onSync.mock.calls[0][0][0]).toMatchObject({ elementId: "x", eventType: "activation" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses to guess an endpoint for the server AI provider", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    runtime = new MindraRuntime({ appId: "app", ai: { provider: "server" } });
    runtime.getState("btn");
    await vi.advanceTimersByTimeAsync(2000);

    expect(fetch).not.toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(" ")).toContain("ai.endpoint");
    warn.mockRestore();
  });
});

describe("MindraRuntime scoring from real interaction", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
  });
  afterEach(() => { runtime?.destroy(); runtime = null; });

  it("moves an element from novice to expert as the user uses it", () => {
    runtime = new MindraRuntime({ appId: "app" });
    document.body.innerHTML = `<button data-adaptive-id="export">Export</button>`;
    const btn = document.querySelector("button")!;

    expect(runtime.getState("export").expertise).toBe("novice");
    for (let i = 0; i < 30; i++) {
      fire(btn, "mouseover");
      fire(btn, "click");
      fire(btn, "mouseout");
    }
    const state = runtime.getState("export");
    expect(state.expertise).toBe("expert");
    expect(state.familiarity).toBeGreaterThan(0.9);
    expect(state.suggestion).toBe("silent");
  });

  it("counts a hover that never converts as abandonment", () => {
    runtime = new MindraRuntime({ appId: "app" });
    document.body.innerHTML = `<button data-adaptive-id="risky">Delete</button>`;
    const btn = document.querySelector("button")!;

    for (let i = 0; i < 10; i++) {
      fire(btn, "mouseover");
      fire(btn, "mouseout");
    }
    expect((runtime as any).storage.getStats("risky").abandonments).toBe(10);
  });

  it("scrubs identifying data out of ids derived from the DOM", () => {
    runtime = new MindraRuntime({ appId: "app" });
    document.body.innerHTML = `<button id="user-a@b.com-delete">Delete</button>`;
    fire(document.querySelector("button")!, "click");

    expect(Object.keys((runtime as any).storage.getAll())).toEqual(["#-delete"]);
  });

  it("notifies subscribers as state changes", () => {
    runtime = new MindraRuntime({ appId: "app" });
    const seen: string[] = [];
    const off = runtime.subscribe((id) => seen.push(id));

    document.body.innerHTML = `<button data-adaptive-id="x">x</button>`;
    fire(document.querySelector("button")!, "click");
    off();
    fire(document.querySelector("button")!, "click");

    expect(seen).toEqual(["x"]);
  });
});
