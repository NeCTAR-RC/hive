import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Me, PublicConfig, ServiceKey } from "../../lib/api/types";
import { SiteHeader } from "./SiteHeader";

const config = {
  site_name: "Nectar Dashboard",
  help_url: "https://support.example.org/",
} as PublicConfig;

const me = {
  user: { id: "u1", name: "sam", domain_id: null },
  roles: ["Member"],
  projects: [],
  capabilities: {
    tenantmanager: false,
    user_lookup: false,
    services: {} as Record<ServiceKey, boolean>,
  },
  session: { expires_at: 0, server_time: 0 },
} as unknown as Me;

function renderHeader(ui: () => ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute({ component: ui }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("SiteHeader", () => {
  it("shows the brand, support links and Explore ARDC tab", async () => {
    renderHeader(() => <SiteHeader me={me} config={config} />);

    const home = await screen.findByRole("link", {
      name: /^ARDC Nectar Research Cloud ?Nectar Dashboard$/,
    });
    expect(home).toHaveAttribute("href", "/");
    expect(
      screen.getByRole("link", { name: "Support Centre" }),
    ).toHaveAttribute("href", "https://support.example.org/");
    expect(screen.getByRole("link", { name: "Explore ARDC" })).toHaveAttribute(
      "href",
      "https://ardc.edu.au/",
    );
    expect(screen.getByRole("button", { name: "sam" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Log In" }),
    ).not.toBeInTheDocument();
  });

  it("lists the Nectar services in a menu", async () => {
    const user = userEvent.setup();
    renderHeader(() => <SiteHeader me={me} config={config} />);

    await user.click(await screen.findByRole("button", { name: "Services" }));

    expect(
      screen.getByRole("menuitem", { name: "Jupyter Notebook Service" }),
    ).toBeInTheDocument();
  });

  it("offers a login button without a user", async () => {
    renderHeader(() => <SiteHeader config={config} showLogin />);

    expect(
      await screen.findByRole("button", { name: "Log In" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Dashboard navigation" }),
    ).not.toBeInTheDocument();
  });

  it("toggles the navigation drawer when given a handler", async () => {
    const user = userEvent.setup();
    const onNavToggle = vi.fn();
    renderHeader(() => (
      <SiteHeader me={me} config={config} onNavToggle={onNavToggle} />
    ));

    const toggle = await screen.findByRole("button", {
      name: "Dashboard navigation",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(onNavToggle).toHaveBeenCalledOnce();
  });
});
