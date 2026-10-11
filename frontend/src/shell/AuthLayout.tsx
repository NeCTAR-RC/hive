import { Outlet } from "@tanstack/react-router";
import { ArdcFooter } from "./ArdcFooter/ArdcFooter";
import { SkipLink } from "./SkipLink";
import styles from "./AuthLayout.module.scss";

/** Pages shown without a session: login, signed out, terms. */
export function AuthLayout() {
  return (
    <div className={styles.page}>
      <SkipLink />
      <main id="main" className={styles.main} tabIndex={-1}>
        <Outlet />
      </main>
      <ArdcFooter />
    </div>
  );
}
