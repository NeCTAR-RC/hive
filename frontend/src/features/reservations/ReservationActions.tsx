// Every reservation action behind one hook, for the list and the detail
// page: `run(action, reservations)` goes to the launch wizard or the
// extend dialog, downloads the calendar entry, or deletes the batch after
// one confirmation. The hook returns the dialogs to render and the props
// for the reservations table.
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DELETE } from "../../components/BulkAction/messages";
import {
  useBulkAction,
  type BulkTableProps,
} from "../../components/BulkAction/useBulkAction";
import { allows } from "../../lib/actions";
import type {
  Reservation,
  ReservationAction,
} from "../../lib/api/types/reservations";
import { deleteReservation, reservationWriteKeys } from "./api";
import { downloadCalendar } from "./calendar";
import { availableReservationActions } from "./status";

const getId = (reservation: Reservation) => reservation.id;

/**
 * The reservation actions. `onDeleted` runs after a delete in which at
 * least one reservation went: the detail page passes it to leave for the
 * list.
 */
export function useReservationActions(onDeleted?: () => void): {
  run: (action: ReservationAction, reservations: Reservation[]) => void;
  dialogs: ReactNode;
  tableProps: BulkTableProps;
} {
  const navigate = useNavigate();
  const bulk = useBulkAction<Reservation, "delete">({
    noun: { one: "reservation", many: "reservations" },
    name: getId,
    getId,
    invalidates: reservationWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (reservation) => deleteReservation(reservation.id),
        body: <p>Deleted reservations are not recoverable.</p>,
        eligible: (reservation) =>
          allows(availableReservationActions(reservation), "delete"),
        skippedWhy: "they are still being created",
        onSucceeded: onDeleted,
      },
    },
  });

  const run = (action: ReservationAction, reservations: Reservation[]) => {
    const [first] = reservations;
    if (!first) return;
    if (action === "launch") {
      void navigate({
        to: "/compute/instances/launch",
        search: { flavor: first.compute_flavor ?? "" },
      });
    } else if (action === "extend") {
      void navigate({
        to: "/reservations/$reservationId",
        params: { reservationId: first.id },
        search: { extend: true },
      });
    } else if (action === "calendar") {
      downloadCalendar(first);
    } else {
      bulk.run("delete", reservations);
    }
  };

  return { run, dialogs: bulk.dialog, tableProps: bulk.tableProps };
}
