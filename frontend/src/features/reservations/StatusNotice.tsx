// The detail page's notice for where a reservation stands.
import { Alert } from "@ardc-ui/react";
import { AppLink } from "../../components/AppLink/AppLink";
import type { Reservation } from "../../lib/api/types/reservations";
import { LAUNCH_HELP } from "./status";

/**
 * What the reservation's status means for the user: being created,
 * reserved until its start, active, or failed with its reason. Other
 * statuses need no notice.
 */
export function StatusNotice({ reservation }: { reservation: Reservation }) {
  switch (reservation.status) {
    case "PENDING_CREATE":
      return (
        <Alert tone="info" role="status">
          The reservation is being created. This page updates on its own.
        </Alert>
      );
    case "ALLOCATED":
      return (
        <Alert tone="info" role="status">
          The flavour is reserved and becomes active at the start time. Read{" "}
          <AppLink href={LAUNCH_HELP} newTab size="xs">
            how to launch an instance with a reservation
          </AppLink>
          .
        </Alert>
      );
    case "ACTIVE":
      return (
        <Alert tone="success" role="status">
          The reservation is active. Launch an instance with the reserved
          flavour before it ends; see{" "}
          <AppLink href={LAUNCH_HELP} newTab size="xs">
            the launch guide
          </AppLink>
          .
        </Alert>
      );
    case "ERROR":
      return (
        <Alert tone="danger" role="status">
          {reservation.status_reason ||
            "Reservation error: please contact Nectar Support."}
        </Alert>
      );
    default:
      return null;
  }
}
