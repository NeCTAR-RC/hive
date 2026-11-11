// The project's service unit use against its budget on the create page.
import type { ReservationOptions } from "../../lib/api/types/reservations";
import { formatNumber } from "../../lib/format";
import styles from "./CreateReservationPage.module.scss";

/**
 * The service units the project has used of its budget this allocation
 * period; a missing or negative budget reads "Unlimited". Without a usage
 * figure it says the usage is unavailable.
 */
export function Usage({ options }: { options: ReservationOptions }) {
  if (options.su_used === null) {
    return (
      <p className={styles.text}>
        Service unit usage for this project is unavailable right now.
      </p>
    );
  }
  const budget =
    options.su_budget === null || options.su_budget < 0
      ? "Unlimited"
      : formatNumber(options.su_budget);
  return (
    <p className={styles.text}>
      You have used{" "}
      <strong>
        {formatNumber(options.su_used)}/{budget} Service Units
      </strong>{" "}
      in this project allocation period.
    </p>
  );
}
