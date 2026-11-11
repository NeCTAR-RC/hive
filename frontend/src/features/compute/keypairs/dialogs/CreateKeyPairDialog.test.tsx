import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyPair } from "../../../../lib/api/types/compute";
import { createTestQueryClient } from "../../../../test/queryClient";
import { keyPairsQuery } from "../../api";
import { CreateKeyPairDialog } from "./CreateKeyPairDialog";

const downloadText = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/download", () => ({ downloadText }));

const PROJECT = "p1";

/** The dialog as a page opens it: unmounted once it closes. */
function Harness({ onCreated }: { onCreated: (keyPair: KeyPair) => void }) {
  const [open, setOpen] = useState(true);
  return open ? (
    <CreateKeyPairDialog onClose={() => setOpen(false)} onCreated={onCreated} />
  ) : null;
}

describe("CreateKeyPairDialog", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    downloadText.mockReset();
    vi.unstubAllGlobals();
  });

  it("hands the private key to the download only", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          name: "laptop",
          type: "ssh",
          fingerprint: "aa:bb",
          public_key: "ssh-ed25519 AAAA",
          private_key: "PRIVATE KEY",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = createTestQueryClient(PROJECT);
    client.setQueryData(keyPairsQuery(PROJECT).queryKey, { items: [] });
    const onCreated = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <Harness onCreated={onCreated} />
      </QueryClientProvider>,
    );

    await user.type(screen.getByLabelText(/Key pair name/), "laptop");
    await user.click(screen.getByRole("button", { name: "Create key pair" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(downloadText).toHaveBeenCalledWith("laptop.pem", "PRIVATE KEY");
    expect(onCreated.mock.calls[0]?.[0]).not.toHaveProperty("private_key");
    // Once the dialog closes, nothing in the cache holds the key.
    await waitFor(() =>
      expect(client.getMutationCache().getAll()).toHaveLength(0),
    );
  });
});
