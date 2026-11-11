import { describe, expect, it } from "vitest";
import {
  queryKeys,
  resourceKeys,
  userKeys,
  type ResourceKeys,
} from "./queryKeys";

const PROJECT = "p1";

/** True when `key` starts with every segment of `prefix`. */
function isUnder(key: readonly unknown[], prefix: readonly unknown[]) {
  return (
    key.length >= prefix.length &&
    prefix.every((segment, i) => Object.is(segment, key[i]))
  );
}

const projectResources = Object.entries(queryKeys).flatMap(([service, group]) =>
  Object.entries(group)
    .filter(([name]) => name !== "service")
    .map(
      ([name, keys]) =>
        [`${service}.${name}`, group.service, keys as ResourceKeys] as const,
    ),
);

describe("queryKeys", () => {
  it.each(projectResources)(
    "%s: every key is under the resource, the service and the project",
    (_name, service, keys) => {
      const all = keys.all(PROJECT);
      expect(isUnder(all, ["project", PROJECT])).toBe(true);
      expect(isUnder(all, service.all(PROJECT))).toBe(true);
      expect(isUnder(keys.list(PROJECT), all)).toBe(true);
      expect(isUnder(keys.list(PROJECT, { q: "web" }), all)).toBe(true);
      expect(isUnder(keys.detail(PROJECT, "id-1"), all)).toBe(true);
    },
  );

  it("never lets one resource's keys fall under another's", () => {
    const prefixes = projectResources.map(([name, , keys]) => ({
      name,
      all: keys.all(PROJECT),
    }));
    for (const a of prefixes) {
      for (const b of prefixes) {
        if (a.name === b.name) continue;
        expect(isUnder(a.all, b.all), `${a.name} under ${b.name}`).toBe(false);
      }
    }
  });

  it("never lets a user resource's keys fall under another's", () => {
    const prefixes = Object.entries(userKeys).map(([name, keys]) => ({
      name,
      all: keys.all(),
    }));
    for (const a of prefixes) {
      expect(isUnder(a.all, ["project"])).toBe(false);
      for (const b of prefixes) {
        if (a.name === b.name) continue;
        expect(isUnder(a.all, b.all), `${a.name} under ${b.name}`).toBe(false);
      }
    }
  });

  it.each(Object.entries(userKeys))(
    "user %s: lists and records are under the resource",
    (_name, keys) => {
      expect(isUnder(keys.list(), keys.all())).toBe(true);
      expect(isUnder(keys.detail("id-1"), keys.all())).toBe(true);
    },
  );

  it("keeps a list and a record apart, whatever the record's id", () => {
    const keys = resourceKeys("compute", "instances");
    expect(isUnder(keys.detail(PROJECT, "list"), keys.list(PROJECT))).toBe(
      false,
    );
    expect(keys.list(PROJECT, { a: 1 })).not.toEqual(keys.list(PROJECT));
  });

  it("keeps projects apart", () => {
    const keys = queryKeys.compute.instances;
    expect(isUnder(keys.all("p2"), keys.all(PROJECT))).toBe(false);
  });
});
