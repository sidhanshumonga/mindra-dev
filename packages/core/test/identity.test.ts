import { describe, it, expect } from "vitest";
import { sanitizeElementId, createEventId, MAX_ELEMENT_ID_LENGTH } from "../src/identity";

describe("sanitizeElementId", () => {
  it("removes email addresses templated into attributes", () => {
    expect(sanitizeElementId("user-sidhanshu@gmail.com-row")).toBe("#-row");
    expect(sanitizeElementId("a.b+c@sub.domain.co.uk")).toBe("#");
  });

  it("collapses record ids so familiarity belongs to the control, not the row", () => {
    expect(sanitizeElementId("order-1048577")).toBe("order-#");
    expect(sanitizeElementId("order-1048578")).toBe(sanitizeElementId("order-1048577"));
  });

  it("removes uuids and long hashes", () => {
    expect(sanitizeElementId("3f2504e0-4f89-11d3-9a0c-0305e82c3301-btn")).toBe("#-btn");
    expect(sanitizeElementId("session-3f2504e04f8911d39a0c")).toBe("session-#");
  });

  it("leaves ordinary identifiers untouched", () => {
    for (const id of ["export-btn", "nav__ul__li:nth-of-type(3)__button", "sidebar_toggle"]) {
      expect(sanitizeElementId(id)).toBe(id);
    }
  });

  it("does not mistake words built from hex letters for hashes", () => {
    // "facade", "added", "decade" are all valid hex strings
    expect(sanitizeElementId("facade-toggle")).toBe("facade-toggle");
    expect(sanitizeElementId("deadbeefdecadeface")).toBe("deadbeefdecadeface");
  });

  it("caps length so a deep DOM path cannot bloat the cache", () => {
    expect(sanitizeElementId("x".repeat(1000))).toHaveLength(MAX_ELEMENT_ID_LENGTH);
  });

  it("is idempotent", () => {
    const once = sanitizeElementId("user-a@b.com/order-12345");
    expect(sanitizeElementId(once)).toBe(once);
  });

  it("handles empty input", () => {
    expect(sanitizeElementId("")).toBe("");
  });
});

describe("createEventId", () => {
  it("does not collide across a large batch", () => {
    const ids = new Set(Array.from({ length: 5000 }, createEventId));
    expect(ids.size).toBe(5000);
  });

  it("still produces an id where crypto is unavailable", () => {
    const original = globalThis.crypto;
    // @ts-expect-error deliberately removing the global under test
    delete globalThis.crypto;
    try {
      expect(createEventId().length).toBeGreaterThan(0);
    } finally {
      globalThis.crypto = original;
    }
  });
});
