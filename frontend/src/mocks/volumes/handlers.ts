// Mocked API for the volume panels: volumes, snapshots and backups.
// The in-memory state is the backend for one page load; handlers change
// it in place, so a create or delete shows up in the following list.
import { http, HttpResponse } from "msw";
import type {
  LaunchVolume,
  LaunchVolumeSnapshot,
} from "../../lib/api/types/compute";
import type {
  Volume,
  VolumeBackup,
  VolumeFault,
  VolumeOptions,
  VolumeSnapshot,
  VolumeTransferCreated,
  VolumeType,
} from "../../lib/api/types/volumes";
import { nextId } from "../ids";
import { apiError, notFound, readBody, type Reply } from "../http";
import {
  backupCreateBody,
  metadataBody,
  snapshotUpdateBody,
  restoreBody,
  retypeBody,
  snapshotCreateBody,
  transferAcceptBody,
  transferCreateBody,
  uploadToImageBody,
  volumeAttachBody,
  volumeCreateBody,
  volumeDetachBody,
  volumeExtendBody,
  volumeUpdateBody,
} from "./schemas";

function volume(
  overrides: Partial<Volume> & { id: string; name: string },
): Volume {
  return {
    description: null,
    size_gb: 20,
    status: "available",
    volume_type: "standard",
    availability_zone: "melbourne-qh2",
    bootable: false,
    encrypted: false,
    multiattach: false,
    attachments: [],
    snapshot_id: null,
    source_volume_id: null,
    image: null,
    group_id: null,
    metadata: {},
    created_at: "2026-09-01T02:00:00Z",
    updated_at: "2026-09-01T02:00:00Z",
    has_snapshots: false,
    fault: null,
    ...overrides,
  };
}

let volumes: Volume[] = [
  volume({
    id: "vol-1",
    name: "web-data",
    description: "Web server data",
    status: "in-use",
    attachments: [
      {
        id: "att-1",
        server_id: "i-web-1",
        device: "/dev/vdb",
        attached_at: "2026-09-02T02:00:00Z",
      },
    ],
    has_snapshots: true,
  }),
  volume({
    id: "vol-2",
    name: "boot-ubuntu",
    size_gb: 30,
    volume_type: "qh2-ssd",
    bootable: true,
    image: { id: "img-ubuntu", name: "NeCTAR Ubuntu 24.04 LTS (Noble)" },
    created_at: "2026-09-15T02:00:00Z",
  }),
  volume({
    id: "vol-3",
    name: "scratch",
    size_gb: 100,
    availability_zone: "monash-02",
    status: "error",
    created_at: "2026-10-01T02:00:00Z",
  }),
];

/**
 * Cinder's newest user message per volume, which the backend reads only
 * for the detail of a volume in an error status.
 */
const faults: Record<string, VolumeFault> = {
  "vol-3": {
    message:
      "schedule allocate volume: Could not find any available weighted backend.",
    created: "2026-10-01T02:00:05Z",
  },
};

/** The transfers this project created, by volume id. */
const outgoing = new Map<string, VolumeTransferCreated>();

/**
 * A transfer another project offers this one, with the key it passed on;
 * accepting it adds the volume here.
 */
const incoming = {
  id: "transfer-from-lab",
  auth_key: "9f8e7d6c5b4a3210",
  name: "dataset-handover",
  volume: volume({
    id: "vol-gift",
    name: "lab-dataset",
    size_gb: 50,
    created_at: "2026-08-01T02:00:00Z",
  }),
};

let snapshots: VolumeSnapshot[] = [
  {
    id: "snap-1",
    name: "web-data-before-upgrade",
    description: "Taken before the OS upgrade",
    size_gb: 20,
    status: "available",
    volume_id: "vol-1",
    volume_name: "web-data",
    progress: "100%",
    group_snapshot_id: null,
    metadata: {},
    created_at: "2026-09-20T02:00:00Z",
    updated_at: "2026-09-20T02:05:00Z",
  },
];

let backups: VolumeBackup[] = [
  {
    id: "bak-1",
    name: "web-data-nightly",
    description: null,
    size_gb: 20,
    status: "available",
    availability_zone: "melbourne-qh2",
    volume_id: "vol-1",
    volume_name: "web-data",
    snapshot_id: "snap-1",
    snapshot_name: "web-data-before-upgrade",
    container: "volumebackups",
    is_incremental: false,
    has_dependent_backups: false,
    data_timestamp: "2026-10-08T15:00:00Z",
    fail_reason: null,
    created_at: "2026-10-08T15:00:00Z",
    updated_at: "2026-10-08T15:20:00Z",
  },
];

export const volumeTypes: VolumeType[] = [
  {
    id: "t-std",
    name: "standard",
    description: "Replicated network storage",
    is_public: true,
    zones: null,
  },
  {
    id: "t-qh2",
    name: "qh2-ssd",
    description: "Local SSD in melbourne-qh2",
    is_public: true,
    zones: ["melbourne-qh2"],
  },
  {
    id: "t-monash",
    name: "monash-ssd",
    description: null,
    is_public: true,
    zones: ["monash-02"],
  },
];

const volumeLimits = {
  maxTotalVolumeGigabytes: 500,
  totalGigabytesUsed: 150,
  maxTotalVolumes: 10,
  totalVolumesUsed: 3,
  maxTotalSnapshots: 10,
  totalSnapshotsUsed: 1,
  maxTotalBackups: 10,
  totalBackupsUsed: 1,
  maxTotalBackupGigabytes: 1000,
  totalBackupGigabytesUsed: 20,
};

/**
 * The volumes the launch wizard can boot from, as the backend's launch
 * options pick them: available and bootable. Read from this state, so the
 * Volumes pages and the wizard show the same volumes.
 */
export function launchVolumes(): LaunchVolume[] {
  return volumes
    .filter((v) => v.status === "available" && v.bootable)
    .map((v) => ({
      id: v.id,
      name: v.name || v.id,
      size_gb: v.size_gb,
      availability_zone: v.availability_zone,
      status: v.status,
      bootable: v.bootable,
    }));
}

/** The volume snapshots the launch wizard can boot from: the available ones. */
export function launchVolumeSnapshots(): LaunchVolumeSnapshot[] {
  return snapshots
    .filter((s) => s.status === "available")
    .map((s) => ({
      id: s.id,
      name: s.name || s.id,
      size_gb: s.size_gb,
      status: s.status,
      volume_id: s.volume_id,
    }));
}

/** Puts a busy volume back to its resting status after a mocked delay. */
function settle(found: Volume, change?: () => void) {
  setTimeout(() => {
    change?.();
    found.status = found.attachments.length ? "in-use" : "available";
  }, 1500);
}

const options = (): VolumeOptions => ({
  availability_zones: [
    { name: "melbourne-qh2", available: true },
    { name: "monash-02", available: true },
  ],
  volume_types: volumeTypes,
  has_zoned_types: true,
  images: [
    {
      id: "img-ubuntu",
      name: "NeCTAR Ubuntu 24.04 LTS (Noble)",
      size: 2 * 1024 ** 3 + 7,
      min_disk: 5,
      disk_format: "qcow2",
      is_snapshot: false,
    },
    {
      id: "img-rocky",
      name: "NeCTAR Rocky Linux 9",
      size: 1024 ** 3,
      min_disk: 10,
      disk_format: "qcow2",
      is_snapshot: false,
    },
  ],
  snapshots: snapshots.filter((s) => s.status === "available"),
  volumes: volumes.filter((v) => ["available", "in-use"].includes(v.status)),
  limits: volumeLimits,
  errors: {},
});

export const volumeHandlers = [
  http.get("/api/volumes", ({ request }) => {
    const status = new URL(request.url).searchParams.get("status");
    return HttpResponse.json<Reply<"/api/volumes", "get">>({
      items: status ? volumes.filter((v) => v.status === status) : volumes,
    });
  }),
  http.get("/api/volumes/options", () =>
    HttpResponse.json<Reply<"/api/volumes/options", "get">>(options()),
  ),
  http.get("/api/volumes/availability-zones", () =>
    HttpResponse.json<Reply<"/api/volumes/availability-zones", "get">>({
      items: options().availability_zones,
    }),
  ),
  http.get("/api/volumes/types", () =>
    HttpResponse.json<Reply<"/api/volumes/types", "get">>({
      items: volumeTypes,
    }),
  ),
  http.get("/api/volumes/limits", () =>
    HttpResponse.json<Reply<"/api/volumes/limits", "get">>(volumeLimits),
  ),
  http.post("/api/volumes", async ({ request }) => {
    const body = await readBody(request, volumeCreateBody);
    const inherits =
      body.source?.type === "snapshot" || body.source?.type === "volume";
    if (!inherits && !body.availability_zone) {
      return apiError(400, "bad_request", "Choose an availability zone");
    }
    const created = volume({
      id: nextId("vol"),
      name: body.name ?? "",
      description: body.description ?? null,
      size_gb: body.size,
      status: "creating",
      availability_zone: inherits
        ? "melbourne-qh2"
        : (body.availability_zone ?? null),
      volume_type: inherits ? "standard" : (body.volume_type ?? "standard"),
      bootable: body.source?.type === "image",
      snapshot_id: body.source?.type === "snapshot" ? body.source.id : null,
      source_volume_id: body.source?.type === "volume" ? body.source.id : null,
      created_at: new Date().toISOString(),
    });
    volumes.unshift(created);
    setTimeout(() => {
      created.status = "available";
    }, 1500);
    return HttpResponse.json<Reply<"/api/volumes", "post">>(created, {
      status: 202,
    });
  }),

  http.get("/api/volumes/snapshots", () =>
    HttpResponse.json<Reply<"/api/volumes/snapshots", "get">>({
      items: snapshots,
    }),
  ),
  http.post("/api/volumes/snapshots", async ({ request }) => {
    const body = await readBody(request, snapshotCreateBody);
    const source = volumes.find((v) => v.id === body.volume_id);
    if (!source) return notFound("volume not found");
    const created: VolumeSnapshot = {
      id: nextId("snap"),
      name: body.name ?? "",
      description: body.description ?? null,
      size_gb: source.size_gb,
      status: "creating",
      volume_id: source.id,
      volume_name: source.name,
      progress: "0%",
      group_snapshot_id: null,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: null,
    };
    snapshots.unshift(created);
    source.has_snapshots = true;
    setTimeout(() => {
      created.status = "available";
      created.progress = "100%";
    }, 1500);
    return HttpResponse.json<Reply<"/api/volumes/snapshots", "post">>(created, {
      status: 202,
    });
  }),
  http.put(
    "/api/volumes/snapshots/:id/metadata",
    async ({ params, request }) => {
      const found = snapshots.find((s) => s.id === params["id"]);
      if (!found) return notFound("snapshot not found");
      found.metadata = (await readBody(request, metadataBody)).metadata;
      return HttpResponse.json<
        Reply<"/api/volumes/snapshots/{snapshot_id}/metadata", "put">
      >({ metadata: found.metadata });
    },
  ),
  http.get("/api/volumes/snapshots/:id", ({ params }) => {
    const found = snapshots.find((s) => s.id === params["id"]);
    return found
      ? HttpResponse.json<Reply<"/api/volumes/snapshots/{snapshot_id}", "get">>(
          found,
        )
      : notFound("snapshot not found");
  }),
  http.patch("/api/volumes/snapshots/:id", async ({ params, request }) => {
    const found = snapshots.find((s) => s.id === params["id"]);
    if (!found) return notFound("snapshot not found");
    Object.assign(found, await readBody(request, snapshotUpdateBody));
    return HttpResponse.json<
      Reply<"/api/volumes/snapshots/{snapshot_id}", "patch">
    >(found);
  }),
  http.delete("/api/volumes/snapshots/:id", ({ params }) => {
    const found = snapshots.find((s) => s.id === params["id"]);
    snapshots = snapshots.filter((s) => s.id !== params["id"]);
    if (found) {
      const source = volumes.find((v) => v.id === found.volume_id);
      if (source) {
        source.has_snapshots = snapshots.some((s) => s.volume_id === source.id);
      }
    }
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/volumes/backups", () =>
    HttpResponse.json<Reply<"/api/volumes/backups", "get">>({ items: backups }),
  ),
  http.post("/api/volumes/backups", async ({ request }) => {
    const body = await readBody(request, backupCreateBody);
    const source = volumes.find((v) => v.id === body.volume_id);
    if (!source) return notFound("volume not found");
    const created: VolumeBackup = {
      id: nextId("bak"),
      name: body.name,
      description: body.description ?? null,
      size_gb: source.size_gb,
      status: "creating",
      availability_zone: source.availability_zone,
      volume_id: source.id,
      volume_name: source.name,
      snapshot_id: body.snapshot_id ?? null,
      snapshot_name:
        snapshots.find((s) => s.id === body.snapshot_id)?.name ?? null,
      container: body.container ?? null,
      is_incremental: body.incremental ?? false,
      has_dependent_backups: false,
      data_timestamp: new Date().toISOString(),
      fail_reason: null,
      created_at: new Date().toISOString(),
      updated_at: null,
    };
    backups.unshift(created);
    setTimeout(() => {
      created.status = "available";
    }, 1500);
    return HttpResponse.json<Reply<"/api/volumes/backups", "post">>(created, {
      status: 202,
    });
  }),
  http.get("/api/volumes/backups/:id", ({ params }) => {
    const found = backups.find((b) => b.id === params["id"]);
    return found
      ? HttpResponse.json<Reply<"/api/volumes/backups/{backup_id}", "get">>(
          found,
        )
      : notFound("backup not found");
  }),
  http.delete("/api/volumes/backups/:id", ({ params }) => {
    backups = backups.filter((b) => b.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("/api/volumes/backups/:id/restore", async ({ params, request }) => {
    const backup = backups.find((b) => b.id === params["id"]);
    if (!backup) return notFound("backup not found");
    const body = await readBody(request, restoreBody);
    if (body.volume_id) {
      const target = volumes.find((v) => v.id === body.volume_id);
      if (target) target.status = "restoring-backup";
      return HttpResponse.json<
        Reply<"/api/volumes/backups/{backup_id}/restore", "post">
      >(
        {
          status: "accepted",
          backup_id: backup.id,
          volume_id: body.volume_id,
          new_volume: false,
        },
        { status: 202 },
      );
    }
    if (!body.availability_zone) {
      return apiError(400, "bad_request", "Choose an availability zone");
    }
    const created = volume({
      id: nextId("vol"),
      name: body.name ?? `restore_backup_${backup.id}`,
      size_gb: backup.size_gb,
      status: "creating",
      availability_zone: body.availability_zone,
      volume_type: body.volume_type ?? "standard",
      created_at: new Date().toISOString(),
    });
    volumes.unshift(created);
    return HttpResponse.json<
      Reply<"/api/volumes/backups/{backup_id}/restore", "post">
    >(
      {
        status: "accepted",
        backup_id: backup.id,
        volume_id: created.id,
        new_volume: true,
        volume: created,
      },
      { status: 202 },
    );
  }),

  http.post("/api/volumes/transfers/accept", async ({ request }) => {
    const body = await readBody(request, transferAcceptBody);
    // An accepted transfer is gone, as in Cinder.
    const accepted = volumes.some((v) => v.id === incoming.volume.id);
    if (body.transfer_id !== incoming.id || accepted) {
      return notFound(`Transfer ${body.transfer_id} could not be found.`);
    }
    if (body.auth_key !== incoming.auth_key) {
      return apiError(
        400,
        "bad_request",
        `Invalid auth key: Attempt to transfer ${body.transfer_id} with invalid auth key.`,
      );
    }
    volumes.unshift(incoming.volume);
    return HttpResponse.json<Reply<"/api/volumes/transfers/accept", "post">>({
      id: incoming.id,
      name: incoming.name,
      volume_id: incoming.volume.id,
    });
  }),

  http.get("/api/volumes/:id", ({ params }) => {
    const found = volumes.find((v) => v.id === params["id"]);
    if (!found) return notFound("volume not found");
    return HttpResponse.json<Reply<"/api/volumes/{volume_id}", "get">>({
      ...found,
      fault: found.status.startsWith("error")
        ? (faults[found.id] ?? null)
        : null,
    });
  }),
  http.put("/api/volumes/:id/metadata", async ({ params, request }) => {
    const found = volumes.find((v) => v.id === params["id"]);
    if (!found) return notFound("volume not found");
    found.metadata = (await readBody(request, metadataBody)).metadata;
    return HttpResponse.json<Reply<"/api/volumes/{volume_id}/metadata", "put">>(
      { metadata: found.metadata },
    );
  }),
  http.post("/api/volumes/:id/retype", async ({ params, request }) => {
    const found = volumes.find((v) => v.id === params["id"]);
    if (!found) return notFound("volume not found");
    const body = await readBody(request, retypeBody);
    if (body.volume_type === found.volume_type) {
      return apiError(
        400,
        "bad_request",
        "The new type must be different from the current volume type",
      );
    }
    const zones = volumeTypes.find((t) => t.name === body.volume_type)?.zones;
    if (
      zones &&
      found.availability_zone &&
      !zones.includes(found.availability_zone)
    ) {
      return apiError(
        400,
        "bad_request",
        `The ${body.volume_type} volume type is not available in ${found.availability_zone}, the volume's availability zone`,
      );
    }
    found.status = "retyping";
    settle(found, () => {
      found.volume_type = body.volume_type;
    });
    return HttpResponse.json<Reply<"/api/volumes/{volume_id}/retype", "post">>(
      { status: "accepted" },
      { status: 202 },
    );
  }),
  http.post("/api/volumes/:id/transfer", async ({ params, request }) => {
    const found = volumes.find((v) => v.id === params["id"]);
    if (!found) return notFound("volume not found");
    const body = await readBody(request, transferCreateBody);
    if (found.status !== "available") {
      return apiError(
        400,
        "bad_request",
        "Invalid volume: Status must be available to transfer the volume",
      );
    }
    const transfer: VolumeTransferCreated = {
      id: nextId("transfer"),
      name: body.name,
      volume_id: found.id,
      auth_key: "0a1b2c3d4e5f6789",
      created_at: new Date().toISOString(),
    };
    outgoing.set(found.id, transfer);
    found.status = "awaiting-transfer";
    return HttpResponse.json<
      Reply<"/api/volumes/{volume_id}/transfer", "post">
    >(transfer, { status: 201 });
  }),
  http.delete("/api/volumes/:id/transfer", ({ params }) => {
    const found = volumes.find((v) => v.id === params["id"]);
    if (!found || !outgoing.delete(found.id)) {
      return notFound("No transfer is waiting for this volume");
    }
    found.status = "available";
    return new HttpResponse(null, { status: 204 });
  }),
  http.patch("/api/volumes/:id", async ({ params, request }) => {
    const found = volumes.find((v) => v.id === params["id"]);
    if (!found) return notFound("volume not found");
    const body = await readBody(request, volumeUpdateBody);
    if (body.name !== undefined) found.name = body.name;
    if (body.description !== undefined) found.description = body.description;
    if (body.bootable !== undefined) found.bootable = body.bootable;
    return HttpResponse.json<Reply<"/api/volumes/{volume_id}", "patch">>(found);
  }),
  http.delete("/api/volumes/:id", ({ params }) => {
    volumes = volumes.filter((v) => v.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("/api/volumes/:id/extend", async ({ params, request }) => {
    const found = volumes.find((v) => v.id === params["id"]);
    if (!found) return notFound("volume not found");
    const body = await readBody(request, volumeExtendBody);
    if (body.new_size <= (found.size_gb ?? 0)) {
      return apiError(
        400,
        "bad_request",
        "New size must be greater than the current size",
      );
    }
    found.status = "extending";
    settle(found, () => {
      found.size_gb = body.new_size;
    });
    return HttpResponse.json<Reply<"/api/volumes/{volume_id}/extend", "post">>(
      { status: "accepted", size_gb: body.new_size },
      { status: 202 },
    );
  }),
  http.post("/api/volumes/:id/attach", async ({ params, request }) => {
    const found = volumes.find((v) => v.id === params["id"]);
    if (!found) return notFound("volume not found");
    const body = await readBody(request, volumeAttachBody);
    const device = body.device ?? "/dev/vdc";
    found.status = "attaching";
    setTimeout(() => {
      found.attachments.push({
        id: nextId("att"),
        server_id: body.instance_id,
        device,
        attached_at: new Date().toISOString(),
      });
      found.status = "in-use";
    }, 1500);
    return HttpResponse.json<Reply<"/api/volumes/{volume_id}/attach", "post">>(
      { status: "accepted", device, server_id: body.instance_id },
      { status: 202 },
    );
  }),
  http.post("/api/volumes/:id/detach", async ({ params, request }) => {
    const found = volumes.find((v) => v.id === params["id"]);
    if (!found) return notFound("volume not found");
    const body = await readBody(request, volumeDetachBody);
    found.status = "detaching";
    settle(found, () => {
      found.attachments = found.attachments.filter(
        (a) => a.server_id !== body.instance_id,
      );
    });
    return HttpResponse.json<Reply<"/api/volumes/{volume_id}/detach", "post">>(
      { status: "accepted" },
      { status: 202 },
    );
  }),
  http.post("/api/volumes/:id/upload-to-image", async ({ params, request }) => {
    const found = volumes.find((v) => v.id === params["id"]);
    if (!found) return notFound("volume not found");
    const body = await readBody(request, uploadToImageBody);
    found.status = "uploading";
    settle(found);
    return HttpResponse.json<
      Reply<"/api/volumes/{volume_id}/upload-to-image", "post">
    >(
      {
        status: "accepted",
        image_id: nextId("img"),
        image_name: body.image_name,
      },
      { status: 202 },
    );
  }),
];
