// Router-wide fallbacks: what a route shows while its lazy component or
// beforeLoad is pending, and when its beforeLoad, loader or render throws
// with no closer error boundary.
import { Loading } from "@ardc-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Navigate,
  useRouter,
  useRouterState,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { ErrorState } from "../components/ErrorState/ErrorState";
import { ApiError } from "../lib/api/client";
import styles from "./RouteFallbacks.module.scss";

export function RoutePending() {
  return (
    <div className={styles.fallback}>
      <Loading>Loading...</Loading>
    </div>
  );
}

/**
 * A 401 (the session ended before the shell installed its handler, or in
 * the session probe itself) goes to the login page; anything else shows
 * the Hive error state with its request id and a retry.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const location = useRouterState({ select: (state) => state.location });
  const isAuth = error instanceof ApiError && error.isAuth;
  const onAuthPage = location.pathname.startsWith("/auth/");

  useEffect(() => {
    if (isAuth) {
      // Forget the stale session so the next dashboard visit re-probes.
      queryClient.removeQueries({ queryKey: ["session"] });
      queryClient.removeQueries({ queryKey: ["me"] });
    }
  }, [isAuth, queryClient]);

  if (isAuth && !onAuthPage) {
    return (
      <Navigate
        to="/auth/login"
        search={{ next: location.href, reason: "expired" }}
        replace
      />
    );
  }
  return (
    <div className={styles.fallback}>
      <ErrorState
        error={error}
        title="This page could not be loaded"
        onRetry={() => {
          reset();
          void router.invalidate();
        }}
      />
    </div>
  );
}
