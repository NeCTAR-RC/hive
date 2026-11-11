// A reservation's calendar entry: where the backend serves it, the name it
// is saved under, and the download itself.
import type { Reservation } from "../../lib/api/types/reservations";
import { downloadUrl } from "../../lib/download";

/** The backend path and the saved file name of a reservation's .ics entry. */
export function calendarFile(reservation: Pick<Reservation, "id">): {
  url: string;
  filename: string;
} {
  return {
    url: `/api/reservations/${reservation.id}/calendar.ics`,
    filename: `nectar-reservation-${reservation.id}.ics`,
  };
}

/** Downloads the reservation's calendar entry as an .ics file. */
export function downloadCalendar(reservation: Reservation): void {
  const { url, filename } = calendarFile(reservation);
  downloadUrl(url, filename);
}
