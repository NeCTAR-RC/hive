import { createRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authLayoutRoute } from "../../app/layouts";
import { optionalText } from "../../lib/search";
import { LoginPage } from "./LoginPage";
import { SignedOutPage } from "./SignedOutPage";

const loginRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: "/auth/login",
  validateSearch: z.object({
    next: optionalText,
    reason: optionalText,
  }),
  component: LoginPage,
});

const signedOutRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: "/auth/signed-out",
  component: SignedOutPage,
});

/**
 * The login and signed-out pages, under the auth layout. They load with the
 * app rather than on demand: a visit without a session starts on one of
 * them.
 */
export const authRoutes = [loginRoute, signedOutRoute];
