import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/api/client";

/** How many times a failed query is tried again. */
const MAX_RETRIES = 2;

/**
 * Whether a failed query is worth another try: a transport failure or an
 * upstream outage (5xx) may pass, but a service this cloud does not run
 * (501 `service_not_enabled`) never will, and any other answer is final.
 * An error that is not from the API (a bug in a query function) is retried
 * as an outage would be.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (!(error instanceof ApiError)) return true;
  if (error.code === "service_not_enabled") return false;
  return error.status === 0 || error.status >= 500;
}

/**
 * The app's one query client. Every query and mutation that fails with a
 * 401 calls `onUnauthenticated`, whoever started it: a page, a route's
 * beforeLoad, or an upload. The session policy therefore lives here, in one
 * place, rather than in a listener a component has to register.
 */
export function createQueryClient({
  onUnauthenticated,
}: {
  onUnauthenticated?: (error: ApiError) => void;
} = {}): QueryClient {
  const onError = (error: unknown) => {
    if (error instanceof ApiError && error.isAuth) onUnauthenticated?.(error);
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: true,
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        retry: false,
      },
    },
  });
}
