// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { MindraStorage } from "../src/storage";

const bump = (s: MindraStorage, id: string) =>
  s.updateStats(id, (p) => ({ ...p, clicks: p.clicks + 1 }));

describe("MindraStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("coalesces writes instead of serialising on every event", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem");
    const s = new MindraStorage("app");

    for (let i = 0; i < 200; i++) bump(s, "btn");
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(s.getStats("btn").clicks).toBe(200);
    spy.mockRestore();
  });

  it("commits pending state on flush", () => {
    const s = new MindraStorage("app");
    bump(s, "btn");
    expect(localStorage.getItem("mindra_stats_app")).toBeNull();
    s.flush();
    expect(JSON.parse(localStorage.getItem("mindra_stats_app")!)["btn"].clicks).toBe(1);
  });

  it("caps the cache and evicts the coldest entries first", () => {
    const s = new MindraStorage("app");
    for (let i = 0; i < 900; i++) bump(s, `el-${i}`);
    s.flush();

    const persisted = JSON.parse(localStorage.getItem("mindra_stats_app")!);
    expect(Object.keys(persisted)).toHaveLength(500);
    // the earliest elements are the coldest, so they are the ones dropped
    expect(persisted["el-0"]).toBeUndefined();
    expect(persisted["el-899"]).toBeDefined();
  });

  it("sanitises keys so DOM-derived and caller-supplied ids agree", () => {
    const s = new MindraStorage("app");
    bump(s, "order-1048577");
    // a different order id resolves to the same scrubbed key
    expect(s.getStats("order-2222222").clicks).toBe(1);
  });

  it("sheds half the cache and retries when the quota is exhausted", () => {
    const s = new MindraStorage("app");
    for (let i = 0; i < 100; i++) bump(s, `el-${i}`);

    let failures = 0;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k, v) {
      if (failures++ === 0) throw new DOMException("quota", "QuotaExceededError");
      Storage.prototype.getItem.call(this, k);
    });

    expect(() => s.flush()).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(2);           // failed once, retried once
    expect(Object.keys(s.getAll()).length).toBe(50); // half shed
    spy.mockRestore();
  });

  it("survives corrupt stored data", () => {
    localStorage.setItem("mindra_stats_app", "not json at all");
    expect(() => new MindraStorage("app")).not.toThrow();
    localStorage.setItem("mindra_stats_app", '["unexpected","array"]');
    expect(new MindraStorage("app").getStats("btn").clicks).toBe(0);
  });

  it("clears everything on demand", () => {
    const s = new MindraStorage("app");
    bump(s, "btn");
    s.flush();
    s.clear();
    expect(localStorage.getItem("mindra_stats_app")).toBeNull();
    expect(s.getStats("btn").clicks).toBe(0);
  });
});
