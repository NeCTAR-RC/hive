import { queryOptions } from "@tanstack/react-query";
import type {
  ApiCredentials,
  ServiceEndpoint,
} from "../../lib/api/types/apiaccess";
import type { Items } from "../../lib/api/types/common";
import { getJson, staleTimes } from "../../lib/queries";
import { queryKeys } from "../../lib/queryKeys";

const keys = queryKeys.apiAccess;

export function endpointsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.endpoints.list(projectId),
    queryFn: getJson<Items<ServiceEndpoint>>("/api/api-access/endpoints"),
    staleTime: staleTimes.static,
  });
}

export function apiAccessCredentialsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.credentials.all(projectId),
    queryFn: getJson<ApiCredentials>("/api/api-access/credentials"),
    staleTime: staleTimes.static,
  });
}
