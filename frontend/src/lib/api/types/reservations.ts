/**
 * Reservations (Warre): reservable flavors, limits, free slots and the
 * reservations themselves.
 *
 * Aliases of the generated contract (`../generated/openapi`); the backend's
 * models are the source of truth.
 */
import type { components } from "../generated/openapi";

type Schemas = components["schemas"];

export type ReservationFlavor = Schemas["ReservationFlavor"];
export type ReservationLimits = Schemas["ReservationLimits"];
export type ReservationAction = Schemas["ReservationAction"];

/**
 * A reservation as the list shows it. `status` is Blazar's lease status:
 * PENDING_CREATE, ALLOCATED, ACTIVE, COMPLETE or ERROR today, kept open
 * for statuses a newer Blazar adds.
 */
export type Reservation = Schemas["Reservation"];

/** One reservation with its calendar links and detail URL. */
export type ReservationDetail = Schemas["ReservationDetail"];

export type ReservationsResponse = Schemas["ReservationsResponse"];
export type MaintenanceWindow = Schemas["MaintenanceWindow"];
export type ReservationOptions = Schemas["ReservationOptions"];

/** A free slot; `first_day` and `last_day` are whole UTC days, inclusive. */
export type FreeSlot = Schemas["FreeSlot"];

export type SlotsResponse = Schemas["SlotsResponse"];

/** The create body (the backend's `ReservationCreate`). */
export type ReservationCreateRequest = Schemas["ReservationCreate"];

export type ExtendWindow = Schemas["ExtendWindow"];
