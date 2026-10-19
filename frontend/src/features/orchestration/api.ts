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
    queryFn: ({ signal }) =>
      apiFetch<Items<Stack>>(`${BASE}/stacks`, { signal }),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      query.state.data?.items.some((s) => s.is_transitional) ? POLL_MS : false,
  });
}

export function stackQuery(projectId: string, stackId: string) {
  return queryOptions({
    queryKey: heatKey(projectId, "stack", stackId),
    queryFn: ({ signal }) =>
      apiFetch<StackDetail>(`${BASE}/stacks/${stackId}`, { signal }),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data?.is_transitional ? POLL_MS : false,
  });
}

export function stackResourcesQuery(projectId: string, stackId: string) {
  return queryOptions({
    queryKey: heatKey(projectId, "stack", stackId, "resources"),
    queryFn: ({ signal }) =>
      apiFetch<Items<StackResource>>(`${BASE}/stacks/${stackId}/resources`, {
        signal,
      }),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data?.items.some((r) => r.is_transitional) ? POLL_MS : false,
  });
}

export function stackEventsQuery(projectId: string, stackId: string) {
  return queryOptions({
    queryKey: heatKey(projectId, "stack", stackId, "events"),
    queryFn: ({ signal }) =>
      apiFetch<Items<StackEvent>>(`${BASE}/stacks/${stackId}/events`, {
        signal,
      }),
    staleTime: staleTimes.detail,
  });
}

export function stackTemplateQuery(projectId: string, stackId: string) {
  return queryOptions({
    queryKey: heatKey(projectId, "stack", stackId, "template"),
    queryFn: ({ signal }) =>
      apiFetch<StackTemplate>(`${BASE}/stacks/${stackId}/template`, { signal }),
    staleTime: staleTimes.static,
  });
}

export function resourceTypesQuery(projectId: string) {
  return queryOptions({
    queryKey: heatKey(projectId, "resource-types"),
    queryFn: ({ signal }) =>
      apiFetch<Items<ResourceTypeSummary>>(`${BASE}/resource-types`, {
        signal,
      }),
    staleTime: staleTimes.static,
  });
}

export function resourceTypeQuery(projectId: string, name: string) {
  return queryOptions({
    queryKey: heatKey(projectId, "resource-type", name),
    queryFn: ({ signal }) =>
      apiFetch<ResourceTypeDetail>(
        `${BASE}/resource-types/${encodeURIComponent(name)}`,
        { signal },
      ),
    staleTime: staleTimes.static,
  });
}

export function templateVersionsQuery(projectId: string) {
  return queryOptions({
    queryKey: heatKey(projectId, "template-versions"),
    queryFn: ({ signal }) =>
      apiFetch<Items<TemplateVersion>>(`${BASE}/template-versions`, { signal }),
    staleTime: staleTimes.static,
  });
}

export function templateFunctionsQuery(projectId: string, version: string) {
  return queryOptions({
    queryKey: heatKey(projectId, "template-functions", version),
    queryFn: ({ signal }) =>
      apiFetch<{ version: string } & Items<TemplateFunction>>(
        `${BASE}/template-versions/${encodeURIComponent(version)}/functions`,
        { signal },
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
