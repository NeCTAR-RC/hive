import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { appLayoutRoute } from "../../app/layouts";
import { createSearch, listSearch } from "../../lib/search";

const containersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/object-store/containers",
  validateSearch: createSearch,
  component: lazyRouteComponent(() => import("./pages"), "ContainersPage"),
});

const containerRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/object-store/containers/$container",
  validateSearch: listSearch,
  component: lazyRouteComponent(() => import("./pages"), "ContainerPage"),
});

/** A folder inside a container: the same view, at a deeper path. */
const containerFolderRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/object-store/containers/$container/$",
  validateSearch: listSearch,
  component: lazyRouteComponent(() => import("./pages"), "ContainerFolderPage"),
});

/** The object storage pages: the containers and a container's folders. */
export const objectStoreRoutes = [
  containersRoute,
  containerRoute,
  containerFolderRoute,
];
