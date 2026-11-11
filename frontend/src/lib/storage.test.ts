import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readLocal, writeLocal } from "./storage";

/** A Map-backed stand-in for `window.localStorage`. */
function memoryStorage(): Pick<Storage, "getItem" | "setItem"> & {
  items: Map<string, string>;
} {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

/** Storage whose every call throws, as in a private window. */
const blockedStorage: Pick<Storage, "getItem" | "setItem"> = {
  getItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("full", "QuotaExceededError");
  },
};

let storage: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal("window", { localStorage: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("writeLocal", () => {
  it("stores the value as JSON under the hive. prefix", () => {
    writeLocal("table.size", { instances: 20 });
    expect(storage.items).toEqual(
      new Map([["hive.table.size", '{"instances":20}']]),
    );
  });

  it("does nothing when storage throws", () => {
    vi.stubGlobal("window", { localStorage: blockedStorage });
    expect(() => writeLocal("table.size", 20)).not.toThrow();
  });
});

describe("readLocal", () => {
  it.each([
    ["an object", { project: true, network: false }],
    ["a number", 50],
    ["a string", "compact"],
    ["false", false],
    ["null", null],
  ])("reads back %s that was written", (_, value) => {
    writeLocal("key", value);
    expect(readLocal("key", "fallback")).toEqual(value);
  });

  it.each([
    ["nothing is stored", () => undefined],
    ["the stored text is not JSON", () => storage.items.set("hive.key", "{")],
    [
      "storage throws",
      () => vi.stubGlobal("window", { localStorage: blockedStorage }),
    ],
    ["there is no window", () => vi.stubGlobal("window", undefined)],
  ])("returns the fallback when %s", (_, arrange) => {
    arrange();
    expect(readLocal("key", { fallback: true })).toEqual({ fallback: true });
  });
});
