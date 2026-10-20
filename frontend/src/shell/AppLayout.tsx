import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { setUnauthenticatedHandler } from "../lib/api/client";
import { configQuery, meQuery } from "../lib/queries";
import { DESKTOP, useMediaQuery } from "../lib/useMediaQuery";
import { ArdcFooter } from "./ArdcComponents/ArdcFooter";
import { ArdcMegamenu } from "./ArdcComponents/ArdcMegamenu";
import { DashboardBar } from "./DashboardBar/DashboardBar";
import { SessionTimeoutWarning } from "./SessionTimeoutWarning";
import { Sidebar } from "./Sidebar/Sidebar";
import { SkipLink } from "./SkipLink";
import styles from "./AppLayout.module.scss";

export function AppLayout() {
  const { data: me } = useQuery(meQuery);
  const { data: config } = useQuery(configQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const isDesktop = useMediaQuery(DESKTOP);
  const [navOpen, setNavOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // A 401 anywhere means the session is gone: back through manuka.
  useEffect(() => {
    setUnauthenticatedHandler(() => {
      queryClient.clear();
      const next = window.location.pathname + window.location.search;
      void navigate({ to: "/auth/login", search: { next } });
    });
    return () => setUnauthenticatedHandler(null);
  }, [navigate, queryClient]);

  // After a navigation resolves: close the drawer and move focus to the
  // new page's heading (once it has rendered).
  useEffect(
    () =>
      router.subscribe("onResolved", (event) => {
        setNavOpen(false);
        if (!event.pathChanged) return;
        requestAnimationFrame(() => {
          const heading = mainRef.current?.querySelector<HTMLElement>("h1");
          (heading ?? mainRef.current)?.focus();
        });
      }),
    [router],
  );

  return (
    <div className={styles.page}>
      <SkipLink />
      <ArdcMegamenu />
      <DashboardBar
        me={me}
        config={config}
        navOpen={navOpen}
        onNavToggle={() => setNavOpen((open) => !open)}
        showNavToggle={!isDesktop}
      />
      <div className={styles.body}>
        <Sidebar
          me={me}
          horizonUrl={config?.horizon_url}
          desktop={isDesktop}
          open={navOpen}
          onOpenChange={setNavOpen}
        />
        <main id="main" className={styles.main} tabIndex={-1} ref={mainRef}>
          <SessionTimeoutWarning me={me} config={config} />
          <Outlet />
        </main>
      </div>
      <ArdcFooter />
    </div>
  );
}
