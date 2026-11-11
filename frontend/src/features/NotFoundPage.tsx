import { AppLink } from "../components/AppLink/AppLink";
import { useDocumentTitle } from "../lib/hooks/useDocumentTitle";
import styles from "./TextPage.module.scss";

export function NotFoundPage({ gone = false }: { gone?: boolean }) {
  useDocumentTitle(gone ? "No longer available" : "Page not found");
  return (
    <div className={styles.band}>
      <div className={styles.text}>
        <div className={styles.copy}>
          <div className={styles.intro}>
            {/* Takes focus after a navigation inside the shell. */}
            <h1 tabIndex={-1}>
              {gone ? "This feature has been retired" : "Page not found"}
            </h1>
            <p>
              {gone
                ? "The application catalogue is no longer part of the Nectar Research Cloud."
                : "There is nothing at this address. It may have moved, or the link may be out of date."}
            </p>
          </div>
          <AppLink variant="primary" to="/">
            Go to the dashboard home
          </AppLink>
        </div>
      </div>
    </div>
  );
}
