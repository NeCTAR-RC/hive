import { useQuery } from "@tanstack/react-query";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { configQuery } from "../lib/queries";
import { ArdcFooter } from "./ArdcComponents/ArdcFooter";
import { SiteHeader } from "./SiteHeader/SiteHeader";
import { SkipLink } from "./SkipLink";
import styles from "./AuthLayout.module.scss";

/** Pages shown without a session: login, signed out, terms. */
export function AuthLayout() {
  const { data: config } = useQuery(configQuery);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className={styles.page}>
      <SkipLink />
      {/* The login page is its own login button. */}
      <SiteHeader config={config} showLogin={pathname !== "/auth/login"} />
      <main id="main" className={styles.main} tabIndex={-1}>
        <Outlet />
      </main>
      <ArdcFooter />
    </div>
  );
}
