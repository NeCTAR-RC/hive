import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Me } from "./api/types";
import { meQuery, useSwitchProject } from "./queries";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("useSwitchProject", () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("drops the old project's queries before publishing the new me", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["project", "old", "allocation"], { su: 1 });
    queryClient.setQueryData(meQuery.queryKey, {
      project: { id: "old" },
    } as unknown as Me);
    const order: string[] = [];
    const remove = queryClient.removeQueries.bind(queryClient);
    vi.spyOn(queryClient, "removeQueries").mockImplementation((filters) => {
      order.push(`remove:${JSON.stringify(filters?.queryKey)}`);
      remove(filters);
    });
    const set = queryClient.setQueryData.bind(queryClient);
    vi.spyOn(queryClient, "setQueryData").mockImplementation((key, updater) => {
      order.push(`set:${JSON.stringify(key)}`);
      return set(key, updater);
    });
    const newMe = { project: { id: "new" } };
    fetchMock.mockResolvedValue(jsonResponse(newMe));

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSwitchProject(), { wrapper });
    await act(() => result.current.mutateAsync("new"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(order.slice(0, 2)).toEqual(['remove:["project"]', 'set:["me"]']);
    expect(queryClient.getQueryData(["project", "old", "allocation"])).toBe(
      undefined,
    );
    expect(queryClient.getQueryData(meQuery.queryKey)).toEqual(newMe);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/session/project");
    expect(init.body).toBe('{"project_id":"new"}');
  });
});
