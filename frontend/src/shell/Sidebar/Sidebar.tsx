import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  ModalOverlay,
  Link as AriaLink,
} from "react-aria-components";
import { ArrowUpRightFromSquare, ChevronDown } from "@ardc-ui/react";
import { Home, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type {
  AllocationSummary,
  Me,
  NetworkExtensions,
} from "../../lib/api/types";
import { allocationQuery } from "../../lib/queries";
import { readLocal, writeLocal } from "../../lib/storage";
import { networkExtensionsQuery } from "../../features/network/api";
import {
  DASHBOARDS,
  HOME,
  linkoutHref,
  panelVisible,
  type Dashboard,
  type Panel,
} from "../navigation/panels";
import { ProjectInfo } from "./ProjectInfo";
import { ProjectSwitcher } from "./ProjectSwitcher";
import styles from "./Sidebar.module.scss";

interface SidebarProps {
  me: Me | undefined;
  horizonUrl: string | undefined;
  desktop: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The dashboard navigation: project switcher and info box, then the panel
 * groups users know from Horizon. Docked on desktop (collapsible to a rail),
 * an off-canvas drawer below 1024px.
 */
export function Sidebar(props: SidebarProps) {
  if (props.desktop) {
    return <DockedSidebar {...props} />;
  }
  return (
    <ModalOverlay
      isOpen={props.open}
      onOpenChange={props.onOpenChange}
      isDismissable
      className={styles.overlay}
    >
      <AriaModal className={styles.drawer}>
        <AriaDialog aria-label="Dashboard navigation" className={styles.dialog}>
          <SidebarContent {...props} collapsed={false} />
        </AriaDialog>
      </AriaModal>
    </ModalOverlay>
  );
}

function DockedSidebar(props: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() =>
    readLocal("sidebar.collapsed", false),
  );
  const toggle = () => {
    setCollapsed((value) => {
      writeLocal("sidebar.collapsed", !value);
      return !value;
    });
  };
  return (
    <aside
      id="hive-sidebar"
      className={collapsed ? styles.rail : styles.sidebar}
      aria-label="Dashboard navigation"
    >
      <button
        type="button"
        className={styles.collapse}
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls="hive-sidebar-nav"
      >
        {collapsed ? (
          <PanelLeftOpen aria-hidden="true" size={20} />
        ) : (
          <PanelLeftClose aria-hidden="true" size={20} />
        )}
        <span className="visually-hidden">
          {collapsed ? "Expand navigation" : "Collapse navigation"}
        </span>
      </button>
      {!collapsed && <SidebarContent {...props} collapsed={collapsed} />}
    </aside>
  );
}

function SidebarContent({
  me,
  horizonUrl,
}: SidebarProps & { collapsed: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const horizon = horizonUrl ?? "";
  // Trunks and Port Forwardings appear only when neutron has the extension.
  const extensions = useQuery({
    ...networkExtensionsQuery(me?.project.id ?? ""),
    enabled: Boolean(me?.capabilities.services.network),
  });
  // Allocation Usage appears only when the allocation has an SU budget.
  const allocation = useQuery({
    ...allocationQuery(me?.project.id ?? ""),
    enabled: Boolean(me && !me.project.is_trial),
  });
  return (
    <div className={styles.content}>
      {me && (
        <div className={styles.project}>
          <ProjectSwitcher me={me} />
          <ProjectInfo me={me} />
        </div>
      )}
      <nav id="hive-sidebar-nav" aria-label="Dashboard" className={styles.nav}>
        <ul className={styles.dashboards}>
          <li>
            <AriaLink
              href={HOME.to ?? "/"}
              className={styles.home}
              aria-current={pathname === "/" ? "page" : undefined}
            >
              <Home aria-hidden="true" size={18} />
              {HOME.label}
            </AriaLink>
          </li>
          {DASHBOARDS.map((dashboard) => (
            <DashboardSection
              key={dashboard.id}
              dashboard={dashboard}
              me={me}
              extensions={extensions.data}
              allocation={allocation.data}
              horizon={horizon}
              pathname={pathname}
            />
          ))}
        </ul>
      </nav>
    </div>
  );
}

function containsPath(dashboard: Dashboard, pathname: string): boolean {
  return dashboard.groups.some((group) =>
    group.panels.some(
      (panel) => panel.to && panel.to !== "/" && pathname.startsWith(panel.to),
    ),
  );
}

function DashboardSection({
  dashboard,
  me,
  extensions,
  allocation,
  horizon,
  pathname,
}: {
  dashboard: Dashboard;
  me: Me | undefined;
  extensions: NetworkExtensions | undefined;
  allocation: AllocationSummary | undefined;
  horizon: string;
  pathname: string;
}) {
  const active = containsPath(dashboard, pathname);
  const [open, setOpen] = useState(active || dashboard.id === "project");
  const [wasActive, setWasActive] = useState(active);
  const panelId = useId();
  // Navigating into a dashboard opens it (derived state, set during render).
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setOpen(true);
  }

  const groups = dashboard.groups
    .map((group) => ({
      ...group,
      panels: group.panels.filter((panel) =>
        panelVisible(panel, me, extensions, allocation),
      ),
    }))
    .filter((group) => group.panels.length > 0);
  if (groups.length === 0) return null;

  return (
    <li className={styles.dashboard}>
      <button
        type="button"
        className={styles.dashboardButton}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {dashboard.label}
        <ChevronDown aria-hidden="true" />
      </button>
      <div id={panelId} hidden={!open}>
        {groups.map((group) => (
          <div key={group.id} className={styles.group}>
            {group.label && (
              <h3 className={styles.groupLabel}>{group.label}</h3>
            )}
            <ul className={styles.panels}>
              {group.panels.map((panel) => (
                <li key={panel.id}>
                  <PanelLink
                    panel={panel}
                    horizon={horizon}
                    pathname={pathname}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </li>
  );
}

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
    const current =
      pathname === panel.to || pathname.startsWith(panel.to + "/");
    return (
      <AriaLink
        href={panel.to}
        className={styles.panel}
        aria-current={current ? "page" : undefined}
      >
        {panel.label}
      </AriaLink>
    );
  }
  return (
    <a href={linkoutHref(horizon, panel)} className={styles.panelLinkout}>
      {panel.label}
      <ArrowUpRightFromSquare aria-hidden="true" />
      <span className="visually-hidden">(opens in the current dashboard)</span>
    </a>
  );
}
