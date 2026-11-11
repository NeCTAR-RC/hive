import { createRoute, redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import {
  configQuery,
  meQuery,
  sessionQuery,
  switchProject,
} from "../lib/queries";
import { AppLayout } from "../shell/AppLayout";
import { AuthLayout } from "../shell/AuthLayout";
import { matchRedirect } from "../shell/navigation/redirects";
import { NotFoundPage } from "../features/NotFoundPage";
import { appLayoutRoute, rootRoute } from "./layouts";

/**
 * Horizon's /auth/switch/<id>/ equivalent: switch the project, then go
 * home. The switch runs in beforeLoad, which a preload must never trigger.
 * Home replaces the switch in the history, so Back does not switch again.
 */
export const switchRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/auth/switch/$projectId",
  beforeLoad: async ({ params, context, preload }) => {
    if (preload) return;
    await switchProject(context.queryClient, params.projectId);
    throw redirect({ to: "/", replace: true });
  },
  component: () => null,
});

/**
 * Whether the visitor has a session, with /api/me loaded for the shell. A
 * failure reads as signed out: the 404 page must not fail with the backend.
 */
async function signedIn(queryClient: QueryClient): Promise<boolean> {
  try {
    const session = await queryClient.ensureQueryData(sessionQuery);
    if (!session.authenticated) return false;
    await queryClient.ensureQueryData(meQuery);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every path no other route claims: an old Horizon URL is redirected
 * through the Horizon redirect map (301; a page Hive still links out to
 * goes to Horizon itself), a retired one shows the "gone" page (410),
 * anything else the 404 page. A signed-in user sees those inside the
 * shell, so the sidebar is still there to move on with; a visitor in the
 * signed-out frame, with the footer. The route sits
 * outside the dashboard layout so a redirect never waits for a login. The
 * router places it last.
 */
export const catchAllRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  beforeLoad: async ({ location, context }) => {
    const match = matchRedirect(location.pathname, location.searchStr);
    if (match?.status === 301) {
      const href = match.horizon
        ? (
            await context.queryClient.ensureQueryData(configQuery)
          ).horizon_url.replace(/\/$/, "") + match.to
        : match.to;
      throw redirect({ href, reloadDocument: match.reloadDocument });
    }
    return {
      gone: match?.status === 410,
      signedIn: await signedIn(context.queryClient),
    };
  },
  component: CatchAllPage,
});

function CatchAllPage() {
  const { gone, signedIn } = catchAllRoute.useRouteContext();
  const page = <NotFoundPage gone={gone} />;
  return signedIn ? (
    <AppLayout>{page}</AppLayout>
  ) : (
    <AuthLayout>{page}</AuthLayout>
  );
}
