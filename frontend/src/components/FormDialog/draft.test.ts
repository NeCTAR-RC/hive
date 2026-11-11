import { describe, expect, it } from "vitest";
import { dropDraft, stashDraft, takeDraft, type DraftStorage } from "./draft";

function memoryStorage(): DraftStorage & { size: () => number } {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
    size: () => items.size,
  };
}

const AT = "/dns/zones?create=true";

describe("form drafts", () => {
  it("restores the stashed values into the same form, once", () => {
    const storage = memoryStorage();
    stashDraft(storage, AT, { name: "example.org.", ttl: 3600 });

    expect(takeDraft(storage, AT, ["ttl", "name"])).toEqual({
      name: "example.org.",
      ttl: 3600,
    });
    expect(takeDraft(storage, AT, ["ttl", "name"])).toBeUndefined();
  });

  it("leaves a draft alone for another form or another address", () => {
    const storage = memoryStorage();
    stashDraft(storage, AT, { name: "example.org." });

    expect(takeDraft(storage, AT, ["name", "email"])).toBeUndefined();
    expect(takeDraft(storage, "/dns/zones", ["name"])).toBeUndefined();
    expect(storage.size()).toBe(1);
  });

  it("never keeps secrets or values JSON cannot carry", () => {
    const storage = memoryStorage();
    stashDraft(storage, AT, {
      name: "db",
      password: "hunter2",
      client_secret: "s",
      file: new Blob(["x"]),
      rules: [{ port: 22 }],
    });

    expect(
      takeDraft(storage, AT, [
        "name",
        "password",
        "client_secret",
        "file",
        "rules",
      ]),
    ).toEqual({ name: "db", rules: [{ port: 22 }] });
  });

  it("forgets a draft when asked, and copes without storage", () => {
    const storage = memoryStorage();
    stashDraft(storage, AT, { name: "x" });
    dropDraft(storage, AT);
    expect(storage.size()).toBe(0);

    stashDraft(undefined, AT, { name: "x" });
    expect(takeDraft(undefined, AT, ["name"])).toBeUndefined();
  });
});
