// Queries and mutations for the Reservations panel (warre), keyed under
// `['project', pid, 'reservations', ...]`.
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type {
  ExtendWindow,
  Reservation,
  ReservationCreateRequest,
  ReservationOptions,
  ReservationsResponse,
  SlotsResponse,
} from "../../lib/api/types";
import { staleTimes } from "../../lib/queries";

export function reservationKey(projectId: string, ...rest: unknown[]) {
  return ["project", projectId, "reservations", ...rest] as const;
}

const POLL_MS = 3000;

export function reservationsQuery(projectId: string) {
  return queryOptions({
    queryKey: reservationKey(projectId, "list"),
    queryFn: () => apiFetch<ReservationsResponse>("/api/reservations"),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      query.state.data?.items.some((r) => r.status === "PENDING_CREATE")
        ? POLL_MS
        : false,
  });
}

export function reservationQuery(projectId: string, reservationId: string) {
  return queryOptions({
    queryKey: reservationKey(projectId, "detail", reservationId),
    queryFn: () => apiFetch<Reservation>(`/api/reservations/${reservationId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data?.status === "PENDING_CREATE" ? POLL_MS : false,
  });
}

export function reservationOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: reservationKey(projectId, "options"),
    queryFn: () => apiFetch<ReservationOptions>("/api/reservations/options"),
    staleTime: staleTimes.list,
  });
}

export type SlotParams = {
  category?: string;
  availability_zone?: string;
};

export function slotsQuery(projectId: string, params: SlotParams) {
  return queryOptions({
    queryKey: reservationKey(projectId, "slots", params),
    queryFn: () =>
      apiFetch<SlotsResponse>("/api/reservations/slots", { query: params }),
    staleTime: staleTimes.list,
  });
}

export function extendOptionsQuery(projectId: string, reservationId: string) {
  return queryOptions({
    queryKey: reservationKey(projectId, "extend", reservationId),
    queryFn: () =>
      apiFetch<ExtendWindow>(
        `/api/reservations/${reservationId}/extend-options`,
      ),
    staleTime: 0,
  });
}

function useInvalidate(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: reservationKey(projectId) });
}

export function useCreateReservation(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: ReservationCreateRequest) =>
      apiFetch<Reservation>("/api/reservations", {
        method: "POST",
        json: body,
      }),
    onSuccess: invalidate,
  });
}

export function useExtendReservation(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ id, end }: { id: string; end: string }) =>
      apiFetch<Reservation>(`/api/reservations/${id}/extend`, {
        method: "POST",
        json: { end },
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteReservation(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/reservations/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
