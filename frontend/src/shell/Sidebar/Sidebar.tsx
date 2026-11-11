import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import type { Key } from "@ardc-ui/react";
import { Accordion, AccordionItem } from "@ardc-ui/react";
import type { Me } from "../../lib/api/types/session";
import { allocationQuery } from "../../lib/queries";
import { readLocal, writeLocal } from "../../lib/storage";
import { networkExtensionsQuery } from "../../features/network/api";
import {
  DASHBOARDS,
  HOME,
  linkoutHref,
  type Dashboard,
  type Panel,
} from "../navigation/panels";
import { LinkGroup, LinkGroups, LinkRow } from "../LinkRows/LinkRows";
import { SCROLL_IDS } from "../scroll";
import { HomeLink } from "./HomeLink";
import { ProjectInfo } from "./ProjectInfo";
import { ProjectSwitcher } from "./ProjectSwitcher";
import styles from "./Sidebar.module.scss";
import {
  containsPath,
  isCurrentPanel,
  panelForPath,
  visibleGroups,
} from "./visibility";

interface SidebarContentProps {
  me: Me | undefined;
  horizonUrl: string | undefined;
}

/**
 * The docked navigation column beside the page, from 768px: three columns of
 * the grid, the frame's full height, scrolling on its own, holding the
 * navigation in a panel on the canvas. Below 768px the same content opens in
 * the navigation dialog instead (see `NavigationDialog`).
 */
export function Sidebar(props: SidebarContentProps) {
  return (
    <aside
      className={styles.sidebar}
      aria-label="Dashboard navigation"
      data-scroll-restoration-id={SCROLL_IDS.sidebar}
    >
      <div className={styles.panel}>
        <SidebarContent {...props} />
      </div>
    </aside>
  );
}

/**
 * The project block (switcher, allocation facts, related links) over the
 * dashboard navigation: Home, then one accordion item per section holding
 * its panels in their groups (function mirrored from Horizon).
 */
export function SidebarContent({ me, horizonUrl }: SidebarContentProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const sections = useSectionState(pathname);
  const visibleSections = useVisibleSections(me);

  // A record page shows the old project's record: after a switch, go to the
  // list it belongs to. A list stays where it is.
  const leaveRecord = () => {
    const list = panelForPath(pathname)?.to;
    if (list && list !== pathname) void router.navigate({ href: list });
  };

  return (
    <div className={styles.content}>
      {me && (
        <div className={styles.project}>
          <ProjectSwitcher me={me} onSwitched={leaveRecord} />
          <ProjectInfo me={me} />
        </div>
      )}
      <nav aria-label="Dashboard" className={styles.nav}>
        <HomeLink href={HOME.to ?? "/"} isCurrent={pathname === "/"}>
          {HOME.label}
        </HomeLink>
        <Accordion
          expandedKeys={sections.expandedKeys}
          onExpandedChange={sections.setExpandedKeys}
          headingLevel={2}
        >
          {visibleSections.map((section) => (
            <AccordionItem
              key={section.id}
              id={section.id}
              title={section.label}
            >
              <LinkGroups>
                {section.groups.map((group) => (
                  <LinkGroup key={group.id} heading={group.label || undefined}>
                    {group.panels.map((panel) => (
                      <PanelLink
                        key={panel.id}
                        panel={panel}
                        horizon={horizonUrl ?? ""}
                        pathname={pathname}
                      />
                    ))}
                  </LinkGroup>
                ))}
              </LinkGroups>
            </AccordionItem>
          ))}
        </Accordion>
      </nav>
    </div>
  );
}

/**
 * The sections and panels visible to this user: Trunks and Port Forwardings
 * only when neutron has the extension, Allocation Usage only when the
 * allocation has an SU budget, and so on (see `panelVisible`).
 */
function useVisibleSections(me: Me | undefined): Dashboard[] {
  const extensions = useQuery({
    ...networkExtensionsQuery(me?.project.id ?? ""),
    enabled: Boolean(me?.capabilities.services.network),
  });
  const allocation = useQuery({
    ...allocationQuery(me?.project.id ?? ""),
    enabled: Boolean(me && !me.project.is_trial),
  });
  return DASHBOARDS.map((dashboard) => ({
    ...dashboard,
    groups: visibleGroups(dashboard, me, extensions.data, allocation.data),
  })).filter((dashboard) => dashboard.groups.length > 0);
}

/**
 * Which section is open, as the accordion's controlled expanded keys. One
 * section at a time, as Horizon's sidebar opens one dashboard at a time
 * (Hakkim, 2026-10-21); opening another closes it, and the open one can be
 * closed, leaving none. The choice persists in localStorage; with none
 * stored, Project starts open. The section holding the current page opens
 * on load and whenever navigation enters it.
 */
function useSectionState(pathname: string) {
  const activeId = DASHBOARDS.find((d) => containsPath(d, pathname))?.id;
  const [openId, setOpenId] = useState<string | null>(
    () => activeId ?? readLocal<string | null>("sidebar.section", "project"),
  );
  const [lastActiveId, setLastActiveId] = useState(activeId);
  // Navigating into a section opens it (derived state, set during render).
  if (activeId !== lastActiveId) {
    setLastActiveId(activeId);
    if (activeId && openId !== activeId) setOpenId(activeId);
  }
  useEffect(() => writeLocal("sidebar.section", openId), [openId]);

  return {
    expandedKeys: new Set<Key>(openId ? [openId] : []),
    setExpandedKeys: (keys: Set<Key>) =>
      setOpenId(DASHBOARDS.find((d) => keys.has(d.id))?.id ?? null),
  };
}

/**
 * A panel row: a Hive route, or a link out to the panel in Horizon while
 * Hive does not have it yet.
 */
function PanelLink({
  panel,
  horizon,
  pathname,
}: {
  panel: Panel;
  horizon: string;
  pathname: string;
}) {
  if (panel.status === "built" && panel.to) {
    return (
      <LinkRow href={panel.to} isCurrent={isCurrentPanel(panel, pathname)}>
        {panel.label}
      </LinkRow>
    );
  }
  return (
    <LinkRow href={linkoutHref(horizon, panel)}>
      {panel.label}
      <span className="visually-hidden">(opens in the current dashboard)</span>
    </LinkRow>
  );
}
