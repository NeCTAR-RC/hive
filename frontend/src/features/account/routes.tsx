import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { appLayoutRoute } from "../../app/layouts";

const myDetailsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/account/my-details",
  component: lazyRouteComponent(() => import("./pages"), "MyDetailsPage"),
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/account/reset-password",
  component: lazyRouteComponent(() => import("./pages"), "ResetPasswordPage"),
});

/** The account pages: My details and the password reset. */
export const accountRoutes = [myDetailsRoute, resetPasswordRoute];
