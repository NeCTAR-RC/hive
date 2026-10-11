import { useQuery } from "@tanstack/react-query";
import { meQuery } from "./queries";

/**
 * The current project's id. The app layout route ensures `/api/me` is in
 * the cache before any dashboard page renders, so this is never empty
 * inside the shell; the fallback only guards tests that render a page bare.
 */
export function useProjectId(): string {
  const { data } = useQuery(meQuery);
  return data?.project.id ?? "";
}
