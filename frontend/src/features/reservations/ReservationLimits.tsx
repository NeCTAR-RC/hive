// The project's reservation limits as two meters (warre-dashboard
// index.html and create.html both show days and reservations used).
import { QuotaMeter } from "../../components/QuotaMeter/QuotaMeter";
import type { ReservationLimits as Limits } from "../../lib/api/types";
import styles from "./ReservationLimits.module.scss";

export function ReservationLimits({ limits }: { limits: Limits }) {
  return (
    <div className={styles.limits}>
      <QuotaMeter
        label="Days reserved"
        value={limits.days_used}
        max={limits.max_days}
        valueText={
          limits.max_days === null
            ? `${limits.days_used} days (no limit)`
            : `${limits.days_used} of ${limits.max_days} days`
        }
      />
      <QuotaMeter
        label="Reservations used"
        value={limits.reservations_used}
        max={limits.max_reservations}
        valueText={
          limits.max_reservations === null
            ? `${limits.reservations_used} (no limit)`
            : `${limits.reservations_used} of ${limits.max_reservations}`
        }
      />
    </div>
  );
}
