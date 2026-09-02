// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { MindraStorage } from "../src/storage";
import { hashIdentifier } from "../src/identity";
import type { ElementStats } from "../src/types";

const stats = (over: Partial<ElementStats> = {}): ElementStats => ({
  clicks: 0, hovers: 0, abandonments: 0, errors: 0, totalHesitation: 0, ...over,
});

describe("hashIdentifier", () => {
  it("is stable across calls", () => {
    expect(hashIdentifier("user@example.com")).toBe(hashIdentifier("user@example.com"));
  });

  it("separates different users", () => {
    expect(hashIdentifier("alice")).not.toBe(hashIdentifier("bob"));
  });

  it("does not leak the original value", () => {
    const hashed = hashIdentifier("sidhanshu@example.com");
    expect(hashed).not.toContain("sidhanshu");
    expect(hashed).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("per-user storage scope", () => {
  beforeEach(() => localStorage.clear());

  it("keeps two users on one browser apart", () => {
    const alice = new MindraStorage("app", undefined, "alice");
    const bob = new MindraStorage("app", undefined, "bob");

    alice.updateStats("export", (p) => ({ ...p, clicks: 30 }));
    alice.flush();

    expect(bob.getStats("export").clicks).toBe(0);
    expect(alice.getStats("export").clicks).toBe(30);
  });

  it("never writes the raw identifier into the storage key", () => {
    const s = new MindraStorage("app", undefined, "user@example.com");
    s.updateStats("x", (p) => ({ ...p, clicks: 1 }));
    s.flush();
    expect(Object.keys(localStorage).join(" ")).not.toContain("user@example.com");
  });

  it("falls back to a shared scope when no user is given", () => {
    const s = new MindraStorage("app");
    s.updateStats("x", (p) => ({ ...p, clicks: 1 }));
    s.flush();
    expect(localStorage.getItem("mindra_stats_app")).not.toBeNull();
  });
});

describe("hydrate", () => {
  beforeEach(() => localStorage.clear());

  it("seeds state persisted elsewhere", () => {
    const s = new MindraStorage("app");
    s.hydrate({ export: stats({ clicks: 12 }) });
    expect(s.getStats("export").clicks).toBe(12);
  });

  it("replaces local state by default", () => {
    const s = new MindraStorage("app");
    s.updateStats("export", (p) => ({ ...p, clicks: 40 }));
    s.hydrate({ export: stats({ clicks: 5 }) });
    expect(s.getStats("export").clicks).toBe(5);
  });

  it("takes the larger counter when merging, so familiarity never regresses", () => {
    const s = new MindraStorage("app");
    s.updateStats("export", (p) => ({ ...p, clicks: 40, errors: 1 }));
    s.hydrate({ export: stats({ clicks: 5, errors: 9 }) }, { merge: true });
    expect(s.getStats("export").clicks).toBe(40);
    expect(s.getStats("export").errors).toBe(9);
  });

  it("is idempotent when merging, so re-hydrating cannot inflate a score", () => {
    const s = new MindraStorage("app");
    const incoming = { export: stats({ clicks: 20 }) };
    s.hydrate(incoming, { merge: true });
    s.hydrate(incoming, { merge: true });
    s.hydrate(incoming, { merge: true });
    expect(s.getStats("export").clicks).toBe(20);
  });

  it("scrubs identifying data out of hydrated keys too", () => {
    const s = new MindraStorage("app");
    s.hydrate({ "order-1048577": stats({ clicks: 3 }) });
    expect(s.getStats("order-2222222").clicks).toBe(3);
  });

  it("ignores malformed entries", () => {
    const s = new MindraStorage("app");
    expect(() => s.hydrate({ a: null as any, b: "nope" as any })).not.toThrow();
  });
});
