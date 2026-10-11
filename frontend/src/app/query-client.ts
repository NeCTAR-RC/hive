import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/api/client";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (failureCount >= 2) return false;
          if (error instanceof ApiError) {
            // Retry only transport failures and upstream outages.
            return error.status === 0 || error.status >= 500;
          }
          return true;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        retry: false,
      },
    },
  });
}
