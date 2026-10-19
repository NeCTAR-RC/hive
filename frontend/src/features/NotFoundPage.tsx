import { RouteLink } from "../components/RouteLink/RouteLink";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import styles from "./NotFoundPage.module.scss";

export function NotFoundPage({ gone = false }: { gone?: boolean }) {
  useDocumentTitle(gone ? "No longer available" : "Page not found");
  return (
    <div className={styles.page}>
      <h1>{gone ? "This feature has been retired" : "Page not found"}</h1>
      <p>
        {gone
          ? "The application catalogue is no longer part of the Nectar Research Cloud."
          : "There is nothing at this address. It may have moved, or the link may be out of date."}
      </p>
      <RouteLink variant="primary" to="/">
        Go to the dashboard home
      </RouteLink>
    </div>
  );
}
