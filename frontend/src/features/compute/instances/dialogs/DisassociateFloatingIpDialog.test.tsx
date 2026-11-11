import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instances } from "../../../../mocks/compute/handlers";
import type { InstancePort } from "../../../../lib/api/types/compute";
import { createTestQueryClient } from "../../../../test/queryClient";
import { instancePortsQuery } from "../../api";
import { DisassociateFloatingIpDialog } from "./DisassociateFloatingIpDialog";

const PROJECT = "p1";

function port(id: string, ip: string, floating: string[]): InstancePort {
  return {
    id,
    network_id: "net-1",
    mac_address: null,
    status: "ACTIVE",
    fixed_ips: [{ ip, subnet_id: "sub-1" }],
    security_groups: [],
    port_security_enabled: true,
    floating_ips: floating.map((address, n) => ({
      id: `fip-${id}-${n}`,
      address,
    })),
  };
}

/** The dialog for the first mock instance, with its ports already loaded. */
function renderDialog(ports: InstancePort[]) {
  const [instance] = instances;
  if (!instance) throw new Error("The mock instance list is empty");
  const client = createTestQueryClient(PROJECT);
  client.setQueryData(instancePortsQuery(PROJECT, instance.id).queryKey, {
    items: ports,
  });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <DisassociateFloatingIpDialog instance={instance} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

describe("DisassociateFloatingIpDialog", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("preselects the instance's only floating IP and disassociates it", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "fip-a-0" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { onClose } = renderDialog([
      port("a", "10.0.0.5", ["203.0.113.9"]),
      port("b", "10.0.0.6", []),
    ]);

    expect(
      screen.getByRole("button", { name: /203\.0\.113\.9 on 10\.0\.0\.5/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Disassociate" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/network/floating-ips/fip-a-0/disassociate");
    expect(init.method).toBe("POST");
  });

  it("asks which one when the instance has several", async () => {
    const user = userEvent.setup();
    renderDialog([
      port("a", "10.0.0.5", ["203.0.113.9"]),
      port("b", "10.0.0.6", ["203.0.113.10"]),
    ]);

    const select = screen.getByRole("button", { name: /Choose a floating IP/ });
    await user.click(screen.getByRole("button", { name: "Disassociate" }));

    await waitFor(() =>
      expect(select).toHaveAccessibleDescription(/Choose a floating IP/),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
