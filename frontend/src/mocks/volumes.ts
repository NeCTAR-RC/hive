// Mocked volume, snapshot and backup data and handlers for VITE_MOCK=1 and
// the Playwright suite. The stores are mutable so a create or delete in a
// test shows up in the following list.
import { http, HttpResponse } from "msw";
import type {
  BackupCreateRequest,
  RestoreRequest,
  SnapshotCreateRequest,
  Volume,
  VolumeBackup,
  VolumeCreateRequest,
  VolumeOptions,
  VolumeSnapshot,
  VolumeType,
  VolumeUpdateRequest,
} from "../lib/api/types";

let counter = 500;
const nextId = (prefix: string) => `${prefix}-${(counter += 1)}`;

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
    ...overrides,
  };
}

export let volumes: Volume[] = [
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

export let snapshots: VolumeSnapshot[] = [
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

export let backups: VolumeBackup[] = [
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

export const volumeLimits = {
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

const notFound = (message: string) =>
  HttpResponse.json({ error: "not_found", message }, { status: 404 });
const badRequest = (message: string) =>
  HttpResponse.json({ error: "bad_request", message }, { status: 400 });

export const volumeHandlers = [
  http.get("/api/volumes", ({ request }) => {
    const status = new URL(request.url).searchParams.get("status");
    return HttpResponse.json({
      items: status ? volumes.filter((v) => v.status === status) : volumes,
    });
  }),
  http.get("/api/volumes/options", () => HttpResponse.json(options())),
  http.get("/api/volumes/limits", () => HttpResponse.json(volumeLimits)),
  http.post("/api/volumes", async ({ request }) => {
    const body = (await request.json()) as VolumeCreateRequest;
    const inherits =
      body.source?.type === "snapshot" || body.source?.type === "volume";
    if (!inherits && !body.availability_zone) {
      return badRequest("Choose an availability zone");
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
    return HttpResponse.json(created, { status: 202 });
  }),

  http.get("/api/volumes/snapshots", () =>
    HttpResponse.json({ items: snapshots }),
  ),
  http.post("/api/volumes/snapshots", async ({ request }) => {
    const body = (await request.json()) as SnapshotCreateRequest;
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
    return HttpResponse.json(created, { status: 202 });
  }),
  http.get("/api/volumes/snapshots/:id", ({ params }) => {
    const found = snapshots.find((s) => s.id === params["id"]);
    return found ? HttpResponse.json(found) : notFound("snapshot not found");
  }),
  http.patch("/api/volumes/snapshots/:id", async ({ params, request }) => {
    const found = snapshots.find((s) => s.id === params["id"]);
    if (!found) return notFound("snapshot not found");
    Object.assign(found, await request.json());
    return HttpResponse.json(found);
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

  http.get("/api/volumes/backups", () => HttpResponse.json({ items: backups })),
  http.post("/api/volumes/backups", async ({ request }) => {
    const body = (await request.json()) as BackupCreateRequest;
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
    return HttpResponse.json(created, { status: 202 });
  }),
  http.get("/api/volumes/backups/:id", ({ params }) => {
    const found = backups.find((b) => b.id === params["id"]);
    return found ? HttpResponse.json(found) : notFound("backup not found");
  }),
  http.delete("/api/volumes/backups/:id", ({ params }) => {
    backups = backups.filter((b) => b.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("/api/volumes/backups/:id/restore", async ({ params, request }) => {
    const backup = backups.find((b) => b.id === params["id"]);
    if (!backup) return notFound("backup not found");
    const body = (await request.json()) as RestoreRequest;
    if (body.volume_id) {
      const target = volumes.find((v) => v.id === body.volume_id);
      if (target) target.status = "restoring-backup";
      return HttpResponse.json(
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
      return badRequest("Choose an availability zone");
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
    return HttpResponse.json(
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

  http.get("/api/volumes/:id", ({ params }) => {
    const found = volumes.find((v) => v.id === params["id"]);
    return found ? HttpResponse.json(found) : notFound("volume not found");
  }),
  http.patch("/api/volumes/:id", async ({ params, request }) => {
    const found = volumes.find((v) => v.id === params["id"]);
    if (!found) return notFound("volume not found");
    const body = (await request.json()) as VolumeUpdateRequest;
    if (body.name !== undefined) found.name = body.name;
    if (body.description !== undefined) found.description = body.description;
    if (body.bootable !== undefined) found.bootable = body.bootable;
    return HttpResponse.json(found);
  }),
  http.delete("/api/volumes/:id", ({ params }) => {
    volumes = volumes.filter((v) => v.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("/api/volumes/:id/extend", async ({ params, request }) => {
    const found = volumes.find((v) => v.id === params["id"]);
    if (!found) return notFound("volume not found");
    const body = (await request.json()) as { new_size: number };
    if (body.new_size <= (found.size_gb ?? 0)) {
      return badRequest("New size must be greater than the current size");
    }
    found.status = "extending";
    setTimeout(() => {
      found.size_gb = body.new_size;
      found.status = found.attachments.length ? "in-use" : "available";
    }, 1500);
    return HttpResponse.json(
      { status: "accepted", size_gb: body.new_size },
      { status: 202 },
    );
  }),
  http.post("/api/volumes/:id/attach", async ({ params, request }) => {
    const found = volumes.find((v) => v.id === params["id"]);
    if (!found) return notFound("volume not found");
    const body = (await request.json()) as {
      instance_id: string;
      device?: string;
    };
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
    return HttpResponse.json(
      { status: "accepted", device, server_id: body.instance_id },
      { status: 202 },
    );
  }),
  http.post("/api/volumes/:id/detach", async ({ params, request }) => {
    const found = volumes.find((v) => v.id === params["id"]);
    if (!found) return notFound("volume not found");
    const body = (await request.json()) as { instance_id: string };
    found.status = "detaching";
    setTimeout(() => {
      found.attachments = found.attachments.filter(
        (a) => a.server_id !== body.instance_id,
      );
      found.status = found.attachments.length ? "in-use" : "available";
    }, 1500);
    return HttpResponse.json({ status: "accepted" }, { status: 202 });
  }),
  http.post("/api/volumes/:id/upload-to-image", async ({ params, request }) => {
    const found = volumes.find((v) => v.id === params["id"]);
    if (!found) return notFound("volume not found");
    const body = (await request.json()) as { image_name: string };
    found.status = "uploading";
    setTimeout(() => {
      found.status = found.attachments.length ? "in-use" : "available";
    }, 1500);
    return HttpResponse.json(
      {
        status: "accepted",
        image_id: nextId("img"),
        image_name: body.image_name,
      },
      { status: 202 },
    );
  }),
];
