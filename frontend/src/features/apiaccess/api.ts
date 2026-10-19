import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type { Items } from "../../lib/api/types";
import { staleTimes } from "../../lib/queries";

export interface ServiceEndpoint {
  type: string;
  name: string;
  url: string;
  region: string | null;
}

export interface ApiCredentials {
  username: string;
  user_id: string;
  user_domain_id: string;
  project_id: string;
  project_name: string;
  project_domain_id: string;
  auth_url: string;
  region: string;
}

export function endpointsQuery(projectId: string) {
  return queryOptions({
    queryKey: ["project", projectId, "api-access", "endpoints"],
    queryFn: ({ signal }) =>
      apiFetch<Items<ServiceEndpoint>>("/api/api-access/endpoints", { signal }),
    staleTime: staleTimes.static,
  });
}

export function credentialsQuery(projectId: string) {
  return queryOptions({
    queryKey: ["project", projectId, "api-access", "credentials"],
    queryFn: ({ signal }) =>
      apiFetch<ApiCredentials>("/api/api-access/credentials", { signal }),
    staleTime: staleTimes.static,
  });
}
