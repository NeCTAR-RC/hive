import { QuotaMeter } from "../../components/QuotaMeter/QuotaMeter";
import type { ReservationLimits } from "../../lib/api/types/reservations";

/**
 * The reserved days and reservations the project has used of its limits, as
 * two meters. The page puts them in the arrangement its column allows.
 */
export function Limits({ limits }: { limits: ReservationLimits }) {
  return (
    <>
      <QuotaMeter label="Days" value={limits.days_used} max={limits.max_days} />
      <QuotaMeter
        label="Reservations"
        value={limits.reservations_used}
        max={limits.max_reservations}
      />
    </>
  );
}
