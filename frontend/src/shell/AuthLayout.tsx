import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { configQuery, meQuery, sessionQuery } from "../lib/queries";
import { DESKTOP, useMediaQuery } from "../lib/hooks/useMediaQuery";
import { ArdcFooter } from "./ArdcFooter";
import { NavigationDialog } from "./NavigationDialog/NavigationDialog";
import { useNavigationDialog } from "./NavigationDialog/useNavigationDialog";
import { ServiceHeader } from "./ServiceHeader/ServiceHeader";
import { SCROLL_IDS } from "./scroll";
import { SkipLink } from "./SkipLink";
import styles from "./AuthLayout.module.scss";

/** The page that stands alone, under the mega menu only. */
const LOGIN_PATH = "/auth/login";

/**
 * Pages readable without a session (signed out, terms) under the service
 * header, with "Log in" where the account menu would be for a visitor
 * without one; then one column that scrolls under the header, closed by the
 * agency footer. The login page stands alone under the mega menu, as
 * Horizon's does: no header (it is its own way in) and no footer (see
 * LoginPage). The page is the matched route's, or `children` for a page
 * outside this layout (the 404 page of a visitor who is not signed in).
 */
export function AuthLayout({ children }: { children?: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const standalone = pathname === LOGIN_PATH;
  return (
    <div className={styles.frame}>
      <SkipLink />
      {!standalone && <AuthHeader />}
      <div
        className={styles.page}
        data-scroll-restoration-id={SCROLL_IDS.content}
      >
        <main id="main" className={styles.main} tabIndex={-1}>
          {children ?? <Outlet />}
        </main>
        <ArdcFooter />
      </div>
    </div>
  );
}

/**
 * The service header for a public page, with the navigation dialog below
 * 1024px. A visitor with a session (reading the terms) gets their account
 * menu, as in the dashboard.
 */
function AuthHeader() {
  const desktop = useMediaQuery(DESKTOP);
  const nav = useNavigationDialog();
  const { data: config } = useQuery(configQuery);
  const { data: session } = useQuery(sessionQuery);
  const { data: me } = useQuery({
    ...meQuery,
    enabled: session?.authenticated === true,
  });
  const signedOut = session?.authenticated === false;
  return (
    <>
      <ServiceHeader
        me={me}
        signedOut={signedOut}
        config={config}
        desktop={desktop}
        navOpen={nav.isOpen}
        onNavToggle={nav.toggle}
      />
      {!desktop && (
        <NavigationDialog
          me={me}
          signedOut={signedOut}
          config={config}
          isOpen={nav.isOpen}
          onOpenChange={nav.setOpen}
          withSidebar={false}
        />
      )}
    </>
  );
}
