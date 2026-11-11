// Queries and mutations for the Orchestration panels (Heat), keyed by
// `queryKeys.orchestration`. Stacks poll while any is IN_PROGRESS, and every
// write refreshes the whole service. Queries pass React Query's abort signal
// on, so leaving a page cancels its requests.
import { queryOptions, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type { Items } from "../../lib/api/types/common";
import type {
  ResourceTypeDetail,
  ResourceTypeSummary,
  Stack,
  StackAccepted,
  StackActionAccepted,
  StackActionRequest,
  StackCreateRequest,
  StackDetail,
  StackEvent,
  StackResource,
  StackTemplate,
  StackUpdateRequest,
  TemplateFunctionList,
  TemplateSource,
  TemplateValidation,
  TemplateVersion,
} from "../../lib/api/types/orchestration";
import { useInvalidate } from "../../lib/hooks/useInvalidate";
import { getJson, pollWhile, staleTimes } from "../../lib/queries";
import { queryKeys } from "../../lib/queryKeys";

const keys = queryKeys.orchestration;

const BASE = "/api/orchestration";

/** What any Heat write marks stale: the whole service. */
export const orchestrationWriteKeys = [keys.service.all];

export function stacksQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.stacks.list(projectId),
    queryFn: getJson<Items<Stack>>(`${BASE}/stacks`),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      pollWhile(
        query,
        query.state.data?.items.some((s) => s.is_transitional),
      ),
  });
}

export function stackQuery(projectId: string, stackId: string) {
  return queryOptions({
    queryKey: keys.stacks.detail(projectId, stackId),
    queryFn: getJson<StackDetail>(`${BASE}/stacks/${stackId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      pollWhile(query, query.state.data?.is_transitional),
  });
}

export function stackResourcesQuery(projectId: string, stackId: string) {
  return queryOptions({
    queryKey: [...keys.stacks.detail(projectId, stackId), "resources"],
    queryFn: getJson<Items<StackResource>>(
      `${BASE}/stacks/${stackId}/resources`,
    ),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      pollWhile(
        query,
        query.state.data?.items.some((r) => r.is_transitional),
      ),
  });
}

export function stackEventsQuery(projectId: string, stackId: string) {
  return queryOptions({
    queryKey: [...keys.stacks.detail(projectId, stackId), "events"],
    queryFn: getJson<Items<StackEvent>>(`${BASE}/stacks/${stackId}/events`),
    staleTime: staleTimes.detail,
  });
}

export function stackTemplateQuery(projectId: string, stackId: string) {
  return queryOptions({
    queryKey: [...keys.stacks.detail(projectId, stackId), "template"],
    queryFn: getJson<StackTemplate>(`${BASE}/stacks/${stackId}/template`),
    staleTime: staleTimes.static,
  });
}

export function resourceTypesQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.resourceTypes.list(projectId),
    queryFn: getJson<Items<ResourceTypeSummary>>(`${BASE}/resource-types`),
    staleTime: staleTimes.static,
  });
}

export function resourceTypeQuery(projectId: string, name: string) {
  return queryOptions({
    queryKey: keys.resourceTypes.detail(projectId, name),
    queryFn: getJson<ResourceTypeDetail>(
      `${BASE}/resource-types/${encodeURIComponent(name)}`,
    ),
    staleTime: staleTimes.static,
  });
}

export function templateVersionsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.templateVersions.list(projectId),
    queryFn: getJson<Items<TemplateVersion>>(`${BASE}/template-versions`),
    staleTime: staleTimes.static,
  });
}

export function templateFunctionsQuery(projectId: string, version: string) {
  return queryOptions({
    queryKey: [
      ...keys.templateVersions.detail(projectId, version),
      "functions",
    ],
    queryFn: getJson<TemplateFunctionList>(
      `${BASE}/template-versions/${encodeURIComponent(version)}/functions`,
    ),
    staleTime: staleTimes.static,
  });
}

export function useValidateTemplate() {
  return useMutation({
    mutationFn: (body: TemplateSource) =>
      apiFetch<TemplateValidation>(`${BASE}/validate`, {
        method: "POST",
        json: body,
      }),
  });
}

export function useCreateStack() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: StackCreateRequest) =>
      apiFetch<StackAccepted>(`${BASE}/stacks`, {
        method: "POST",
        json: body,
      }),
    onSettled: () => void invalidate(...orchestrationWriteKeys),
  });
}

export function useUpdateStack() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: StackUpdateRequest & { id: string }) =>
      apiFetch<StackAccepted>(`${BASE}/stacks/${id}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => void invalidate(...orchestrationWriteKeys),
  });
}

/**
 * Sends one stack action (suspend, resume, check, cancel an update); a
 * batch sends it per stack.
 */
export function requestStackAction(
  stackId: string,
  action: StackActionRequest["action"],
) {
  return apiFetch<StackActionAccepted>(`${BASE}/stacks/${stackId}/actions`, {
    method: "POST",
    json: { action } satisfies StackActionRequest,
  });
}

/** Deletes one stack with its resources; a batch sends it per stack. */
export function deleteStack(stackId: string) {
  return apiFetch<void>(`${BASE}/stacks/${stackId}`, { method: "DELETE" });
}
