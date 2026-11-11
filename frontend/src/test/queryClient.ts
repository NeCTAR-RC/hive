import { QueryClient } from "@tanstack/react-query";
import { meQuery } from "../lib/queries";
import { me } from "../mocks/core/fixtures";

/**
 * A QueryClient for component tests: no retries, and the session's
 * `/api/me` already cached with `projectId` as the current project, as the
 * app layout guarantees, so hooks that read the project id themselves
 * (useProjectId, useInvalidate) find it without a request.
 */
export function createTestQueryClient(projectId: string): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const session = me();
  client.setQueryData(meQuery.queryKey, {
    ...session,
    project: { ...session.project, id: projectId },
  });
  return client;
}
