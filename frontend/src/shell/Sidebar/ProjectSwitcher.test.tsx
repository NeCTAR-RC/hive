import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Me } from "../../lib/api/types/session";
import { FILTER_THRESHOLD, ProjectSwitcher } from "./ProjectSwitcher";

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
  project: { ...project("p1", "Alpha project"), is_trial: false },
  roles: ["Member"],
  projects,
  capabilities: {
    tenantmanager: false,
    user_lookup: false,
    services: {},
  },
  session: { expires_at: 0, server_time: 0 },
};

function renderSwitcher(projectCount: number) {
  const client = new QueryClient();
  const user: Me = { ...me, projects: projects.slice(0, projectCount) };
  return render(
    <QueryClientProvider client={client}>
      <ProjectSwitcher me={user} />
    </QueryClientProvider>,
  );
}

describe("ProjectSwitcher", () => {
  it("offers a select while the list is short", async () => {
    const user = userEvent.setup();
    renderSwitcher(FILTER_THRESHOLD);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Alpha project/ }));
    expect(screen.getAllByRole("option")).toHaveLength(FILTER_THRESHOLD);
  });

  it("filters by typing once the list is long", async () => {
    const user = userEvent.setup();
    renderSwitcher(FILTER_THRESHOLD + 1);

    const field = screen.getByRole("combobox", { name: "Project" });
    await user.clear(field);
    await user.type(field, "beta");

    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Beta project"]);
  });
});
