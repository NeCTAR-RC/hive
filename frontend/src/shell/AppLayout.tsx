import { useEffect, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useRouter } from "@tanstack/react-router";
import { leavePage } from "../lib/notify";
import { configQuery, meQuery } from "../lib/queries";
import { DESKTOP, TABLET, useMediaQuery } from "../lib/hooks/useMediaQuery";
import { ArdcFooter } from "./ArdcFooter";
import { NavigationDialog } from "./NavigationDialog/NavigationDialog";
import { useNavigationDialog } from "./NavigationDialog/useNavigationDialog";
import { ServiceHeader } from "./ServiceHeader/ServiceHeader";
import { SessionTimeoutWarning } from "./SessionTimeoutWarning";
import { Sidebar } from "./Sidebar/Sidebar";
import { SCROLL_IDS } from "./scroll";
import { SkipLink } from "./SkipLink";
import styles from "./AppLayout.module.scss";

/**
 * The signed-in frame, laid out as Horizon's: the service header stays put
 * at the top; under it the docked sidebar (from 768px) and the content
 * column each scroll on their own, and the agency footer closes the content
 * column. Below 1024px the header's button opens the navigation dialog. The
 * page is the matched route's, or `children` for a page outside the
 * dashboard layout (the 404 page of a signed-in user).
 */
export function AppLayout({ children }: { children?: ReactNode }) {
  const { data: me, dataUpdatedAt: meReceivedAt } = useQuery(meQuery);
  const { data: config } = useQuery(configQuery);
  const router = useRouter();
  const desktop = useMediaQuery(DESKTOP);
  const docked = useMediaQuery(TABLET);
  const nav = useNavigationDialog();
  const mainRef = useRef<HTMLElement>(null);

  // After a navigation to another page: close the lasting toasts of the
  // page left behind, and move focus to the new page's heading (once it has
  // rendered). The focus does not scroll: the router has already put the
  // content column at the top of a new page, or back where it was on Back.
  useEffect(
    () =>
      router.subscribe("onResolved", (event) => {
        if (!event.pathChanged) return;
        leavePage(event.toLocation.pathname);
        requestAnimationFrame(() => {
          const heading = mainRef.current?.querySelector<HTMLElement>("h1");
          (heading ?? mainRef.current)?.focus({ preventScroll: true });
        });
      }),
    [router],
  );

  return (
    <div className={styles.page}>
      <SkipLink />
      <ServiceHeader
        me={me}
        config={config}
        desktop={desktop}
        navOpen={nav.isOpen}
        onNavToggle={nav.toggle}
      />
      {!desktop && (
        <NavigationDialog
          me={me}
          config={config}
          isOpen={nav.isOpen}
          onOpenChange={nav.setOpen}
          withSidebar={!docked}
        />
      )}
      <div className={styles.body}>
        {docked && <Sidebar me={me} horizonUrl={config?.horizon_url} />}
        <div
          className={styles.content}
          data-scroll-restoration-id={SCROLL_IDS.content}
        >
          <main id="main" className={styles.main} tabIndex={-1} ref={mainRef}>
            <SessionTimeoutWarning
              me={me}
              meReceivedAt={meReceivedAt}
              config={config}
            />
            {children ?? <Outlet />}
          </main>
          <ArdcFooter />
        </div>
      </div>
    </div>
  );
}
