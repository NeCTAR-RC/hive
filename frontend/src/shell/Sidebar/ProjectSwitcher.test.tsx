import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Me, ServiceKey } from "../../lib/api/types";
import { ProjectSwitcher } from "./ProjectSwitcher";

function project(id: string, name: string) {
  return { id, name, domain_id: null, enabled: true };
}

const projects = [
  project("p1", "Alpha project"),
  project("p2", "Beta project"),
  project("p3", "Gamma project"),
  project("p4", "Delta project"),
  project("p5", "Epsilon project"),
  project("p6", "Zeta project"),
  project("p7", "Eta project"),
  project("p8", "Theta project"),
  project("p9", "Iota project"),
];

const me: Me = {
  user: { id: "u1", name: "sam", domain_id: null },
  project: { ...projects[0], is_trial: false },
  roles: ["Member"],
  projects,
  capabilities: {
    tenantmanager: false,
    user_lookup: false,
    services: {} as Record<ServiceKey, boolean>,
  },
  session: { expires_at: 0, server_time: 0 },
};

function renderSwitcher() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ProjectSwitcher me={me} />
    </QueryClientProvider>,
  );
}

describe("ProjectSwitcher", () => {
  it("focuses the filter when the selector opens", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole("button", { name: "Alpha project" }));

    const filter = screen.getByRole("searchbox", { name: "Filter projects" });
    expect(filter).toHaveFocus();

    await user.keyboard("beta");
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Beta project"]);
  });
});
