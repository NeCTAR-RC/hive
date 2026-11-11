import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";
import { appLayoutRoute } from "../../app/layouts";
import {
  createSearch,
  listSearch,
  optionalFlag,
  optionalText,
} from "../../lib/search";

const membersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/members",
  validateSearch: listSearch.extend({ add: optionalFlag }),
  component: lazyRouteComponent(() => import("./pages"), "MembersPage"),
});

const userLookupRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/identity/user-lookup",
  validateSearch: z.object({ q: optionalText }),
  component: lazyRouteComponent(() => import("./pages"), "UserLookupPage"),
});

const userDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/identity/users/$userId",
  component: lazyRouteComponent(() => import("./pages"), "UserDetailPage"),
});

const appCredentialsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/identity/application-credentials",
  validateSearch: createSearch,
  component: lazyRouteComponent(
    () => import("./pages"),
    "ApplicationCredentialsPage",
  ),
});

const appCredentialRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/identity/application-credentials/$credentialId",
  component: lazyRouteComponent(
    () => import("./pages"),
    "ApplicationCredentialDetailPage",
  ),
});

const credentialsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/identity/credentials",
  component: lazyRouteComponent(() => import("./pages"), "CredentialsPage"),
});

/**
 * The identity pages: project members, user lookup, application
 * credentials and credentials.
 */
export const identityRoutes = [
  membersRoute,
  userLookupRoute,
  userDetailRoute,
  appCredentialsRoute,
  appCredentialRoute,
  credentialsRoute,
];
