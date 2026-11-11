/**
 * The volume storage pages as one chunk. The routes in `routes.tsx` load this
 * module the first time one of them is visited, so the group's code stays
 * out of the first paint and arrives whole for the group's other pages.
 */
export { BackupDetailPage } from "./backups/BackupDetailPage";
export { BackupsPage } from "./backups/BackupsPage";
export { SnapshotDetailPage } from "./snapshots/SnapshotDetailPage";
export { SnapshotsPage } from "./snapshots/SnapshotsPage";
export { VolumeDetailPage } from "./volumes/VolumeDetailPage";
export { VolumesPage } from "./volumes/VolumesPage";
