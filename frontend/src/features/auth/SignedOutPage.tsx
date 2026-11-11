import { AppLink } from "../../components/AppLink/AppLink";
import { useDocumentTitle } from "../../lib/hooks/useDocumentTitle";
import styles from "../TextPage.module.scss";

export function SignedOutPage() {
  useDocumentTitle("Signed out");
  return (
    <div className={styles.band}>
      <div className={styles.text}>
        <div className={styles.copy}>
          <div className={styles.intro}>
            <h1>You have signed out</h1>
            <p>
              Your dashboard session has ended. Your identity provider session
              may still be active, so logging in again can be immediate.
            </p>
          </div>
          <AppLink variant="primary" to="/auth/login">
            Log in again
          </AppLink>
        </div>
      </div>
    </div>
  );
}
