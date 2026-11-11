// The reservation detail page's header actions.
import { Button, Menu, MenuItem, MenuTrigger } from "@ardc-ui/react";
import { AppLink } from "../../components/AppLink/AppLink";
import { allows } from "../../lib/actions";
import type {
  ReservationAction,
  ReservationDetail,
} from "../../lib/api/types/reservations";
import { calendarFile } from "./calendar";
import { availableReservationActions } from "./status";
import styles from "./ReservationsPage.module.scss";

/**
 * The actions the reservation offers now: launch an instance on its
 * flavour, extend, add it to a calendar (the .ics file or one of the
 * calendar services), and delete. Actions it does not offer are left out.
 */
export function HeaderActions({
  reservation,
  onExtend,
  onDelete,
}: {
  reservation: ReservationDetail;
  onExtend: () => void;
  onDelete: () => void;
}) {
  const offers = availableReservationActions(reservation);
  const can = (action: ReservationAction) => allows(offers, action);
  const calendar = reservation.calendar;
  const ics = calendarFile(reservation);
  return (
    <div className={styles.actions}>
      {can("launch") && (
        <AppLink
          variant="primary"
          size="sm"
          to="/compute/instances/launch"
          search={{ flavor: reservation.compute_flavor ?? "" }}
        >
          Launch instance
        </AppLink>
      )}
      {can("extend") && (
        <Button variant="secondary" size="sm" onPress={onExtend}>
          Extend
        </Button>
      )}
      {can("calendar") && (
        <MenuTrigger>
          <Button variant="secondary" size="sm">
            Add to calendar
          </Button>
          {/* Link rows, so each is announced and opened as a link. */}
          <Menu aria-label="Add to calendar" placement="bottom end">
            <MenuItem id="ics" href={ics.url} download={ics.filename}>
              Download .ics file
            </MenuItem>
            <MenuItem
              id="google"
              href={calendar.google}
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Calendar (opens in a new tab)
            </MenuItem>
            <MenuItem
              id="outlook"
              href={calendar.outlook}
              target="_blank"
              rel="noopener noreferrer"
            >
              Outlook, work or school (opens in a new tab)
            </MenuItem>
            <MenuItem
              id="outlook_personal"
              href={calendar.outlook_personal}
              target="_blank"
              rel="noopener noreferrer"
            >
              Outlook.com (opens in a new tab)
            </MenuItem>
          </Menu>
        </MenuTrigger>
      )}
      {can("delete") && (
        <Button variant="secondary" tone="danger" size="sm" onPress={onDelete}>
          Delete
        </Button>
      )}
    </div>
  );
}
