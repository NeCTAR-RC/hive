import { describe, expect, it } from "vitest";
import {
  GROUP_SEARCH_THRESHOLD,
  filterGroups,
  offersGroupSearch,
  rulesTitle,
} from "./securityRules";

const groups = [
  { name: "default", description: "Default security group" },
  { name: "web", description: "HTTP and HTTPS from anywhere" },
  { name: "ssh-office", description: "SSH from the office" },
];

describe("filterGroups", () => {
  it("keeps every group for a blank query", () => {
    expect(filterGroups(groups, "  ")).toEqual(groups);
  });

  it("matches the name or the description, in any case", () => {
    expect(filterGroups(groups, "WEB").map((g) => g.name)).toEqual(["web"]);
    expect(filterGroups(groups, "ssh").map((g) => g.name)).toEqual([
      "ssh-office",
    ]);
    expect(filterGroups(groups, "office ssh").map((g) => g.name)).toEqual([
      "ssh-office",
    ]);
  });

  it("returns nothing when no group holds every word", () => {
    expect(filterGroups(groups, "web office")).toEqual([]);
  });
});

describe("offersGroupSearch", () => {
  it("offers the search above the threshold only", () => {
    expect(offersGroupSearch(GROUP_SEARCH_THRESHOLD)).toBe(false);
    expect(offersGroupSearch(GROUP_SEARCH_THRESHOLD + 1)).toBe(true);
  });
});

describe("rulesTitle", () => {
  it("counts the rules in the title", () => {
    expect(rulesTitle(0)).toBe("Rules (0)");
    expect(rulesTitle(4)).toBe("Rules (4)");
  });
});
