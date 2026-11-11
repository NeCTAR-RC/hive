import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadBalancerTree } from "../../../../mocks/loadbalancers/handlers";
import { createTestQueryClient } from "../../../../test/queryClient";
import { L7PolicyDialog } from "./L7PolicyDialog";

function renderDialog() {
  const tree = loadBalancerTree("lb-1");
  if (!tree) throw new Error("The mock load balancer lb-1 is missing");
  const client = createTestQueryClient("p1");
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <L7PolicyDialog
        tree={tree}
        listenerId="l-1"
        policy={null}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { onClose };
}

describe("L7PolicyDialog", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("keeps a redirect URL typed straight after choosing the action", async () => {
    const user = userEvent.setup();
    // The options request fails, so the dialog offers its built-in actions;
    // the create request succeeds.
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("/l7policies")
          ? new Response(JSON.stringify({ id: "pol-new" }), {
              status: 201,
              headers: { "Content-Type": "application/json" },
            })
          : new Response(null, { status: 503 }),
      ),
    );
    const { onClose } = renderDialog();

    await user.type(screen.getByRole("textbox", { name: "Name" }), "to-docs");
    await user.click(screen.getByRole("button", { name: /Action/ }));
    await user.click(screen.getByRole("option", { name: "Redirect to URL" }));
    const url = screen.getByRole("textbox", { name: "Redirect URL" });
    await user.type(url, "https://docs.example.org");
    expect(url).toHaveValue("https://docs.example.org");

    await user.click(screen.getByRole("button", { name: "Create policy" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const create = fetchMock.mock.calls.find(([called]) =>
      String(called).includes("/l7policies"),
    ) as [string, RequestInit] | undefined;
    expect(JSON.parse(String(create?.[1].body))).toMatchObject({
      listener_id: "l-1",
      name: "to-docs",
      action: "REDIRECT_TO_URL",
      redirect_url: "https://docs.example.org",
    });
  });
});
