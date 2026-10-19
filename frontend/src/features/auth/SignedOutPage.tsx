import { RouteLink } from "../../components/RouteLink/RouteLink";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import styles from "./SignedOutPage.module.scss";

export function SignedOutPage() {
  useDocumentTitle("Signed out");
  return (
    <div className={styles.page}>
      <h1>You have signed out</h1>
      <p>
        Your dashboard session has ended. Your identity provider session may
        still be active, so logging in again can be immediate.
      </p>
      <RouteLink variant="primary" to="/auth/login" search={{}}>
        Log in again
      </RouteLink>
    </div>
  );
}
