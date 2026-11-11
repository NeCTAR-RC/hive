import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { appLayoutRoute } from "../../app/layouts";
import { listSearch, tabSearch } from "../../lib/search";

const stacksRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/orchestration/stacks",
  validateSearch: listSearch,
  component: lazyRouteComponent(() => import("./pages"), "StacksPage"),
});

const launchStackRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/orchestration/stacks/new",
  component: lazyRouteComponent(() => import("./pages"), "LaunchStackPage"),
});

const stackRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/orchestration/stacks/$stackId",
  validateSearch: tabSearch(["overview", "resources", "events", "template"]),
  component: lazyRouteComponent(() => import("./pages"), "StackDetailPage"),
});

const resourceTypesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/orchestration/resource-types",
  validateSearch: listSearch,
  component: lazyRouteComponent(() => import("./pages"), "ResourceTypesPage"),
});

const resourceTypeRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/orchestration/resource-types/$name",
  component: lazyRouteComponent(
    () => import("./pages"),
    "ResourceTypeDetailPage",
  ),
});

const templateVersionsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/orchestration/template-versions",
  component: lazyRouteComponent(
    () => import("./pages"),
    "TemplateVersionsPage",
  ),
});

const templateVersionRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/orchestration/template-versions/$version",
  component: lazyRouteComponent(
    () => import("./pages"),
    "TemplateVersionDetailPage",
  ),
});

/** The orchestration pages: stacks, resource types and template versions. */
export const orchestrationRoutes = [
  stacksRoute,
  launchStackRoute,
  stackRoute,
  resourceTypesRoute,
  resourceTypeRoute,
  templateVersionsRoute,
  templateVersionRoute,
];
