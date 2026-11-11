// The reservation feedback block at the foot of the create page.
import { AppLink } from "../../components/AppLink/AppLink";
import { Panel } from "../../components/Panel/Panel";
import styles from "./CreateReservationPage.module.scss";
import { FEEDBACK_FORM } from "./status";

/** The invitation to tell the team about the Reservation System. */
export function FeedbackPanel() {
  return (
    <div className={styles.feedback}>
      <Panel title="We'd love your feedback!">
        <div className={styles.cta}>
          <p className={styles.text}>
            Thank you for using the Reservation System. Please let us know about
            your experience via the online feedback form.
          </p>
          <div className={styles.action}>
            <AppLink href={FEEDBACK_FORM} newTab variant="primary" size="sm">
              Feedback form
            </AppLink>
          </div>
        </div>
      </Panel>
    </div>
  );
}
