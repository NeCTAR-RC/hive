import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";
import { appLayoutRoute } from "../../app/layouts";
import { optionalFlag, optionalText } from "../../lib/search";

const reservationsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/reservations",
  component: lazyRouteComponent(() => import("./pages"), "ReservationsPage"),
});

const createReservationRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/reservations/new",
  validateSearch: z.object({
    category: optionalText,
    zone: optionalText,
  }),
  component: lazyRouteComponent(
    () => import("./pages"),
    "CreateReservationPage",
  ),
});

const reservationRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/reservations/$reservationId",
  validateSearch: z.object({ extend: optionalFlag }),
  component: lazyRouteComponent(
    () => import("./pages"),
    "ReservationDetailPage",
  ),
});

/** The reservation pages: the list, the create page and a reservation. */
export const reservationRoutes = [
  reservationsRoute,
  createReservationRoute,
  reservationRoute,
];
