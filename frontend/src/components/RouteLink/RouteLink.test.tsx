import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { RouteLink } from "./RouteLink";

function renderAt(ui: () => ReactNode) {
  const root = createRootRoute({ component: ui });
  const instance = createRoute({
    getParentRoute: () => root,
    path: "/compute/instances/$instanceId",
  });
  const router = createRouter({
    routeTree: root.addChildren([instance]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("RouteLink", () => {
  it("builds the href from the route and its params", async () => {
    renderAt(() => (
      <RouteLink
        to="/compute/instances/$instanceId"
        params={{ instanceId: "a b" }}
        search={{ tab: "log" } as never}
      >
        My instance
      </RouteLink>
    ));
    const link = await screen.findByRole("link", { name: "My instance" });
    expect(link).toHaveAttribute("href", "/compute/instances/a%20b?tab=log");
  });

  it("passes the design-system link props through", async () => {
    renderAt(() => (
      <RouteLink to="/compute/instances" aria-label="All instances">
        Instances
      </RouteLink>
    ));
    const link = await screen.findByRole("link", { name: "All instances" });
    expect(link).toHaveAttribute("href", "/compute/instances");
  });
});
