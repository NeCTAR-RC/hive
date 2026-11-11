import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ProjectKeyOf } from "../queryKeys";
import { useProjectId } from "./useProjectId";

/**
 * Marks cached data stale after a write, so what is on screen refetches.
 * Each target builds a key for the current project, which this hook reads
 * itself: pass a resource's or service's `all`, a resource's `list`, or a
 * function for one record, such as
 * `(projectId) => queryKeys.objectStore.containers.detail(projectId, name)`.
 * The promise settles once every refetch has.
 */
export function useInvalidate() {
  const queryClient = useQueryClient();
  const projectId = useProjectId();
  return useCallback(
    async (...targets: ProjectKeyOf[]): Promise<void> => {
      await Promise.all(
        targets.map((keyOf) =>
          queryClient.invalidateQueries({ queryKey: keyOf(projectId) }),
        ),
      );
    },
    [queryClient, projectId],
  );
}
