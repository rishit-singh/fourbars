import { describe, expect, it } from "vitest";
import { consumeAuthReturn, getSafeAuthReturn, rememberAuthReturn } from "./auth-redirect";

describe("getSafeAuthReturn", () => {
  it.each(["/editor/new", "/editor/abc-123", "/m/abc_123"])("accepts %s", (path) => {
    expect(getSafeAuthReturn(path)).toBe(path);
  });
  it.each([
    null,
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/admin",
    "/editor/a?to=/",
  ])("rejects unsafe path %s", (path) => {
    expect(getSafeAuthReturn(path)).toBe("/");
  });
});

describe("auth return intent", () => {
  function storage() {
    const entries = new Map<string, string>();
    return {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
      removeItem: (key: string) => {
        entries.delete(key);
      },
    };
  }
  it("consumes a safe intent once without storing credentials", () => {
    const store = storage();
    rememberAuthReturn(store, "/editor/new", 1000);
    expect(consumeAuthReturn(store, 2000)).toBe("/editor/new");
    expect(consumeAuthReturn(store, 2000)).toBe("/");
  });
  it("expires after thirty minutes", () => {
    const store = storage();
    rememberAuthReturn(store, "/m/abc", 1000);
    expect(consumeAuthReturn(store, 1000 + 30 * 60 * 1000)).toBe("/");
  });
  it("rejects external or malformed stored destinations", () => {
    const store = storage();
    rememberAuthReturn(store, "//evil.example", 1000);
    expect(consumeAuthReturn(store, 2000)).toBe("/");
    store.setItem("fourbars.auth-return", "not json");
    expect(consumeAuthReturn(store, 2000)).toBe("/");
  });
  it("tolerates blocked storage", () => {
    const store = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => rememberAuthReturn(store, "/editor/new")).not.toThrow();
    expect(consumeAuthReturn(store)).toBe("/");
  });
});
