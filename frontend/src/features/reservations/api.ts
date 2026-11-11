// Queries and mutations for the Reservations panel (warre), keyed by
// `queryKeys.reservations`. A new reservation leaves PENDING_CREATE within
// seconds, so it polls on the quick interval; every write refreshes the
// whole service, without the mutation waiting for the refetch. Queries pass
// React Query's abort signal on, so leaving a page cancels its requests.
import { queryOptions, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type {
  ExtendWindow,
  Reservation,
  ReservationDetail,
  ReservationCreateRequest,
  ReservationOptions,
  ReservationsResponse,
  SlotsResponse,
} from "../../lib/api/types/reservations";
import { useInvalidate } from "../../lib/hooks/useInvalidate";
import {
  getJson,
  pollWhile,
  pollIntervals,
  staleTimes,
} from "../../lib/queries";
import { queryKeys } from "../../lib/queryKeys";
import { isPending } from "./status";

const keys = queryKeys.reservations;

export function reservationsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.reservations.list(projectId),
    queryFn: getJson<ReservationsResponse>("/api/reservations"),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      pollWhile(
        query,
        query.state.data?.items.some(isPending),
        pollIntervals.quick,
      ),
  });
}

export function reservationQuery(projectId: string, reservationId: string) {
  return queryOptions({
    queryKey: keys.reservations.detail(projectId, reservationId),
    queryFn: getJson<ReservationDetail>(`/api/reservations/${reservationId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      pollWhile(
        query,
        query.state.data && isPending(query.state.data),
        pollIntervals.quick,
      ),
  });
}

export function reservationOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.options.all(projectId),
    queryFn: getJson<ReservationOptions>("/api/reservations/options"),
    staleTime: staleTimes.list,
  });
}

export type SlotParams = {
  category?: string;
  availability_zone?: string;
  /** The last day to look for free slots, "YYYY-MM-DD". */
  end?: string;
};

export function slotsQuery(projectId: string, params: SlotParams) {
  return queryOptions({
    queryKey: keys.slots.list(projectId, params),
    queryFn: getJson<SlotsResponse>("/api/reservations/slots", params),
    staleTime: staleTimes.list,
  });
}

export function extendOptionsQuery(projectId: string, reservationId: string) {
  return queryOptions({
    queryKey: [
      ...keys.reservations.detail(projectId, reservationId),
      "extend-options",
    ],
    queryFn: getJson<ExtendWindow>(
      `/api/reservations/${reservationId}/extend-options`,
    ),
    staleTime: staleTimes.none,
  });
}

/** What every reservation write makes stale: the whole service. */
export const reservationWriteKeys = [keys.service.all];

export function useCreateReservation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ReservationCreateRequest) =>
      apiFetch<Reservation>("/api/reservations", {
        method: "POST",
        json: body,
      }),
    onSettled: () => void invalidate(...reservationWriteKeys),
  });
}

/**
 * Extends a reservation. When the backend refuses (400, the date is past the
 * free window; 409, the slot after the reservation has gone) the settle
 * refreshes the reservation's extend window, which the open dialog reads.
 */
export function useExtendReservation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, end }: { id: string; end: string }) =>
      apiFetch<Reservation>(`/api/reservations/${id}/extend`, {
        method: "POST",
        json: { end },
      }),
    onSettled: () => void invalidate(...reservationWriteKeys),
  });
}

/** Deletes one reservation; a batch sends it per reservation. */
export function deleteReservation(id: string) {
  return apiFetch<void>(`/api/reservations/${id}`, { method: "DELETE" });
}
