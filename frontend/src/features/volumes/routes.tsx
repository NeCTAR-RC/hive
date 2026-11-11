import {
  createRoute,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import { z } from "zod";
import { appLayoutRoute } from "../../app/layouts";
import { optionalFlag, optionalText, statusListSearch } from "../../lib/search";

const volumesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/storage/volumes",
  validateSearch: statusListSearch.extend({
    create: optionalFlag,
    snapshot: optionalText,
    image: optionalText,
    volume: optionalText,
  }),
  component: lazyRouteComponent(() => import("./pages"), "VolumesPage"),
});

/**
 * Horizon's /project/volumes/create/?snapshot_id= (and image_id, volume_id)
 * lands here via the redirect map; open the create dialog on the list.
 */
const volumeCreateRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/storage/volumes/create",
  validateSearch: z.object({
    snapshot_id: optionalText,
    image_id: optionalText,
    volume_id: optionalText,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/storage/volumes",
      search: {
        create: true,
        ...(search.snapshot_id ? { snapshot: search.snapshot_id } : {}),
        ...(search.image_id ? { image: search.image_id } : {}),
        ...(search.volume_id ? { volume: search.volume_id } : {}),
      },
      replace: true,
    });
  },
});

const volumeRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/storage/volumes/$volumeId",
  component: lazyRouteComponent(() => import("./pages"), "VolumeDetailPage"),
});

const snapshotsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/storage/snapshots",
  validateSearch: statusListSearch,
  component: lazyRouteComponent(() => import("./pages"), "SnapshotsPage"),
});

const snapshotRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/storage/snapshots/$snapshotId",
  component: lazyRouteComponent(() => import("./pages"), "SnapshotDetailPage"),
});

const backupsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/storage/backups",
  validateSearch: statusListSearch,
  component: lazyRouteComponent(() => import("./pages"), "BackupsPage"),
});

const backupRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/storage/backups/$backupId",
  component: lazyRouteComponent(() => import("./pages"), "BackupDetailPage"),
});

/** The volume storage pages: volumes, volume snapshots, volume backups. */
export const volumeRoutes = [
  volumesRoute,
  volumeCreateRoute,
  volumeRoute,
  snapshotsRoute,
  snapshotRoute,
  backupsRoute,
  backupRoute,
];
