// Queries and mutations for the Orchestration panels (Heat), keyed under
// `['project', pid, 'heat', ...]`. Stacks poll while any is IN_PROGRESS.
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type {
  Items,
  ResourceTypeDetail,
  ResourceTypeSummary,
  Stack,
  StackCreateRequest,
  StackDetail,
  StackEvent,
  StackResource,
  StackTemplate,
  StackUpdateRequest,
  TemplateFunction,
  TemplateSource,
  TemplateValidation,
  TemplateVersion,
} from "../../lib/api/types";
import { staleTimes } from "../../lib/queries";

export function heatKey(projectId: string, ...rest: unknown[]) {
  return ["project", projectId, "heat", ...rest] as const;
}

const BASE = "/api/orchestration";
const POLL_MS = 5000;

export function stacksQuery(projectId: string) {
  return queryOptions({
    queryKey: heatKey(projectId, "stacks"),
    queryFn: () => apiFetch<Items<Stack>>(`${BASE}/stacks`),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      query.state.data?.items.some((s) => s.is_transitional) ? POLL_MS : false,
  });
}

export function stackQuery(projectId: string, stackId: string) {
  return queryOptions({
    queryKey: heatKey(projectId, "stack", stackId),
    queryFn: () => apiFetch<StackDetail>(`${BASE}/stacks/${stackId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data?.is_transitional ? POLL_MS : false,
  });
}

export function stackResourcesQuery(projectId: string, stackId: string) {
  return queryOptions({
    queryKey: heatKey(projectId, "stack", stackId, "resources"),
    queryFn: () =>
      apiFetch<Items<StackResource>>(`${BASE}/stacks/${stackId}/resources`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data?.items.some((r) => r.is_transitional) ? POLL_MS : false,
  });
}

export function stackEventsQuery(projectId: string, stackId: string) {
  return queryOptions({
    queryKey: heatKey(projectId, "stack", stackId, "events"),
    queryFn: () =>
      apiFetch<Items<StackEvent>>(`${BASE}/stacks/${stackId}/events`),
    staleTime: staleTimes.detail,
  });
}

export function stackTemplateQuery(projectId: string, stackId: string) {
  return queryOptions({
    queryKey: heatKey(projectId, "stack", stackId, "template"),
    queryFn: () =>
      apiFetch<StackTemplate>(`${BASE}/stacks/${stackId}/template`),
    staleTime: staleTimes.static,
  });
}

export function resourceTypesQuery(projectId: string) {
  return queryOptions({
    queryKey: heatKey(projectId, "resource-types"),
    queryFn: () =>
      apiFetch<Items<ResourceTypeSummary>>(`${BASE}/resource-types`),
    staleTime: staleTimes.static,
  });
}

export function resourceTypeQuery(projectId: string, name: string) {
  return queryOptions({
    queryKey: heatKey(projectId, "resource-type", name),
    queryFn: () =>
      apiFetch<ResourceTypeDetail>(
        `${BASE}/resource-types/${encodeURIComponent(name)}`,
      ),
    staleTime: staleTimes.static,
  });
}

export function templateVersionsQuery(projectId: string) {
  return queryOptions({
    queryKey: heatKey(projectId, "template-versions"),
    queryFn: () =>
      apiFetch<Items<TemplateVersion>>(`${BASE}/template-versions`),
    staleTime: staleTimes.static,
  });
}

export function templateFunctionsQuery(projectId: string, version: string) {
  return queryOptions({
    queryKey: heatKey(projectId, "template-functions", version),
    queryFn: () =>
      apiFetch<{ version: string } & Items<TemplateFunction>>(
        `${BASE}/template-versions/${encodeURIComponent(version)}/functions`,
      ),
    staleTime: staleTimes.static,
  });
}

function useInvalidate(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({ queryKey: heatKey(projectId) });
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

export function useCreateStack(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: StackCreateRequest) =>
      apiFetch<{ id: string; name: string }>(`${BASE}/stacks`, {
        method: "POST",
        json: body,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateStack(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ id, ...body }: StackUpdateRequest & { id: string }) =>
      apiFetch<{ id: string; name: string }>(`${BASE}/stacks/${id}`, {
        method: "PATCH",
        json: body,
      }),
    onSuccess: invalidate,
  });
}

export function useStackAction(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      apiFetch<{ id: string; action: string }>(
        `${BASE}/stacks/${id}/actions/${action}`,
        { method: "POST" },
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteStack(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`${BASE}/stacks/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
