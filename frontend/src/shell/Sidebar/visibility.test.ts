import { describe, expect, it } from "vitest";
import type { Dashboard, Panel } from "../navigation/panels";
import {
  containsPath,
  isCurrentPanel,
  panelForPath,
  visibleGroups,
} from "./visibility";

function panel(overrides: Partial<Panel> & Pick<Panel, "id">): Panel {
  return {
    label: overrides.id,
    status: "built",
    to: `/${overrides.id}`,
    horizonPath: `/project/${overrides.id}/`,
    ...overrides,
  };
}

const instances = panel({ id: "instances", to: "/compute/instances" });
const images = panel({ id: "images", to: "/compute/images" });
const clusters = panel({
  id: "clusters",
  requires: ["container-infra"],
});
const hidden = panel({ id: "hidden", status: "hidden" });

const project: Dashboard = {
  id: "project",
  label: "Project",
  groups: [
    { id: "compute", label: "Compute", panels: [instances, hidden, images] },
    { id: "containers", label: "Containers", panels: [clusters] },
  ],
};

describe("visibleGroups", () => {
  it("keeps the visible panels of each group in order", () => {
    expect(visibleGroups(project, undefined, undefined, undefined)).toEqual([
      { id: "compute", label: "Compute", panels: [instances, images] },
    ]);
  });

  it("drops a group whose panels are all hidden", () => {
    const onlyHidden: Dashboard = {
      ...project,
      groups: [{ id: "empty", label: "", panels: [hidden] }],
    };
    expect(visibleGroups(onlyHidden, undefined, undefined, undefined)).toEqual(
      [],
    );
  });

  it("leaves the section's own groups alone", () => {
    visibleGroups(project, undefined, undefined, undefined);
    expect(project.groups.map((group) => group.panels.length)).toEqual([3, 1]);
  });
});

describe("isCurrentPanel", () => {
  it.each([
    ["the panel's own path", "/compute/instances", true],
    ["a page under the panel", "/compute/instances/abc", true],
    ["a sibling sharing the prefix", "/compute/instances-old", false],
    ["another panel's path", "/compute/images", false],
    ["the root", "/", false],
  ])("for %s is %s", (_, pathname, expected) => {
    expect(isCurrentPanel(instances, pathname)).toBe(expected);
  });

  it("matches the root route only on the root", () => {
    const home = panel({ id: "home", to: "/" });
    expect(isCurrentPanel(home, "/")).toBe(true);
    expect(isCurrentPanel(home, "/compute/instances")).toBe(false);
  });

  it("never marks a panel Hive does not have", () => {
    const linkout = panel({ id: "linkout", status: "linkout", to: undefined });
    const noRoute = panel({ id: "unrouted", to: undefined });
    expect(isCurrentPanel(linkout, "/linkout")).toBe(false);
    expect(isCurrentPanel(noRoute, "/unrouted")).toBe(false);
  });
});

describe("containsPath", () => {
  it.each([
    ["a page under one of its panels", "/compute/images/xyz", true],
    ["a panel that is not built", "/hidden", false],
    ["a path outside the section", "/network/routers", false],
  ])("for %s is %s", (_, pathname, expected) => {
    expect(containsPath(project, pathname)).toBe(expected);
  });
});

describe("panelForPath", () => {
  const home = panel({ id: "home", to: "/" });
  const zones = panel({ id: "zones", to: "/dns/zones" });
  const nested = panel({ id: "nested", to: "/dns/zones/shared" });
  const linkout = panel({ id: "linkout", status: "linkout", to: undefined });
  const panels = [home, zones, nested, linkout];

  it("finds the panel of a list or of one of its records", () => {
    expect(panelForPath("/dns/zones", panels)).toBe(zones);
    expect(panelForPath("/dns/zones/z-1", panels)).toBe(zones);
  });

  it("prefers the longest route", () => {
    expect(panelForPath("/dns/zones/shared/x", panels)).toBe(nested);
  });

  it("finds nothing for a path no panel holds", () => {
    expect(panelForPath("/dns/zonesx", panels)).toBeUndefined();
    expect(panelForPath("/security/risks", panels)).toBeUndefined();
  });

  it("reads the real registry by default", () => {
    expect(panelForPath("/compute/instances/i-1")?.label).toBe("Instances");
  });
});
