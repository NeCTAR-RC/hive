import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";
import { appLayoutRoute } from "../../app/layouts";
import {
  listSearch,
  optionalFlag,
  optionalText,
  tabParam,
  tabSearch,
} from "../../lib/search";

const dbInstancesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/databases/instances",
  validateSearch: listSearch,
  component: lazyRouteComponent(() => import("./pages"), "InstancesPage"),
});

const launchDbRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/databases/instances/new",
  validateSearch: z.object({ backup: optionalText }),
  component: lazyRouteComponent(() => import("./pages"), "LaunchInstancePage"),
});

const dbInstanceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/databases/instances/$instanceId",
  // `log` opens a guest log's viewer (the Horizon log_contents redirect);
  // `q` searches the defaults tab.
  validateSearch: listSearch.extend({
    tab: tabParam([
      "overview",
      "users",
      "databases",
      "backups",
      "logs",
      "defaults",
      "root",
    ]),
    log: optionalText,
  }),
  component: lazyRouteComponent(() => import("./pages"), "InstanceDetailPage"),
});

const dbBackupsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/databases/backups",
  validateSearch: listSearch.extend({
    create: optionalFlag,
    instance: optionalText,
  }),
  component: lazyRouteComponent(() => import("./pages"), "BackupsPage"),
});

const dbBackupRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/databases/backups/$backupId",
  component: lazyRouteComponent(() => import("./pages"), "BackupDetailPage"),
});

const dbConfigurationsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/databases/configuration-groups",
  validateSearch: listSearch,
  component: lazyRouteComponent(() => import("./pages"), "ConfigurationsPage"),
});

const dbConfigurationRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/databases/configuration-groups/$configurationId",
  validateSearch: tabSearch(["values", "instances", "details"]),
  component: lazyRouteComponent(
    () => import("./pages"),
    "ConfigurationDetailPage",
  ),
});

/**
 * The database pages: instances (with the launch page), backups and
 * configuration groups.
 */
export const databaseRoutes = [
  dbInstancesRoute,
  launchDbRoute,
  dbInstanceRoute,
  dbBackupsRoute,
  dbBackupRoute,
  dbConfigurationsRoute,
  dbConfigurationRoute,
];
