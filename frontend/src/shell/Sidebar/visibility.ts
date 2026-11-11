// Pure rules of the sidebar: which panel groups a user sees and which panel
// row, and so which section, holds the current page.
import type { NetworkExtensions } from "../../lib/api/types/network";
import type { Me } from "../../lib/api/types/session";
import type { AllocationSummary } from "../../lib/api/types/usage";
import {
  allPanels,
  panelVisible,
  type Dashboard,
  type Panel,
  type PanelGroup,
} from "../navigation/panels";

/**
 * The section's groups holding only the panels this user may see (see
 * `panelVisible`); a group left with no panel is dropped.
 */
export function visibleGroups(
  dashboard: Dashboard,
  me: Me | undefined,
  extensions: NetworkExtensions | undefined,
  allocation: AllocationSummary | undefined,
): PanelGroup[] {
  return dashboard.groups
    .map((group) => ({
      ...group,
      panels: group.panels.filter((panel) =>
        panelVisible(panel, me, extensions, allocation),
      ),
    }))
    .filter((group) => group.panels.length > 0);
}

/**
 * Whether the panel's row marks the current page: a built panel whose route
 * is the path or a parent of it. The root route matches only itself.
 */
export function isCurrentPanel(panel: Panel, pathname: string): boolean {
  if (panel.status !== "built" || !panel.to) return false;
  if (panel.to === "/") return pathname === "/";
  return pathname === panel.to || pathname.startsWith(panel.to + "/");
}

/** Whether any panel of the section marks the current page. */
export function containsPath(dashboard: Dashboard, pathname: string): boolean {
  return dashboard.groups.some((group) =>
    group.panels.some((panel) => isCurrentPanel(panel, pathname)),
  );
}

/**
 * The built panel whose page holds the path: the panel itself, or the list
 * a detail page belongs to (`/dns/zones/z-1` is in "Zones"). The longest
 * route wins, so a nested panel beats its parent. Finds the list a detail
 * page leaves for when the project changes.
 */
export function panelForPath(
  pathname: string,
  panels: Panel[] = allPanels(),
): Panel | undefined {
  return panels
    .filter((panel) => isCurrentPanel(panel, pathname))
    .reduce<Panel | undefined>(
      (best, panel) =>
        !best || (panel.to ?? "").length > (best.to ?? "").length
          ? panel
          : best,
      undefined,
    );
}
