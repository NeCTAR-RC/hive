// The dialogs behind the volume actions: create, edit, extend, manage
// attachments, snapshot, backup and upload to image.
import { useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Button, Dialog, Modal } from "@ardc-ui/react";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import {
  NumberInput,
  RadioInput,
  SelectInput,
  SwitchInput,
  TextAreaInput,
  TextInput,
} from "../../../components/Form/fields";
import { QuotaMeter } from "../../../components/QuotaMeter/QuotaMeter";
import type {
  Volume,
  VolumeCreateRequest,
  VolumeSourceType,
} from "../../../lib/api/types";
import { formatBytes, formatGb } from "../../../lib/format";
import { notify } from "../../../lib/notify";
import {
  attachableInstancesQuery,
  snapshotsQuery,
  useAttachVolume,
  useCreateBackup,
  useCreateSnapshot,
  useCreateVolume,
  useDetachVolume,
  useExtendVolume,
  useUpdateVolume,
  useUploadToImage,
  volumeLimitsQuery,
  volumeOptionsQuery,
} from "../api";
import { attachmentLabel } from "../status";
import { gigabytesAvailable, sizeFloor, typesForZone } from "./rules";
import styles from "./VolumeDialogs.module.scss";

const NAME = z.string().trim().max(255, "At most 255 characters");

// --- create ------------------------------------------------------------------

const SOURCES: { id: VolumeSourceType | "none"; label: string }[] = [
  { id: "none", label: "No source (empty volume)" },
  { id: "image", label: "Image" },
  { id: "snapshot", label: "Volume snapshot" },
  { id: "volume", label: "Another volume" },
];

const createSchema = z
  .object({
    name: NAME,
    description: NAME,
    source: z.enum(["none", "image", "snapshot", "volume"]),
    source_id: z.string(),
    size: z.number().int().min(1, "At least 1 GB"),
    availability_zone: z.string(),
    volume_type: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.source !== "none" && !values.source_id) {
      ctx.addIssue({
        code: "custom",
        path: ["source_id"],
        message: "Choose a source",
      });
    }
    if (
      (values.source === "none" || values.source === "image") &&
      !values.availability_zone
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["availability_zone"],
        message: "An availability zone is required",
      });
    }
  });

export function CreateVolumeDialog({
  projectId,
  isOpen,
  onOpenChange,
  initialSource,
}: {
  projectId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialSource?: { type: VolumeSourceType; id: string } | undefined;
}) {
  const options = useQuery({
    ...volumeOptionsQuery(projectId),
    enabled: isOpen,
  });
  const create = useCreateVolume(projectId);
  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      description: "",
      source: initialSource?.type ?? "none",
      source_id: initialSource?.id ?? "",
      size: 1,
      availability_zone: "",
      volume_type: "",
    },
  });
  const source = useWatch({ control: form.control, name: "source" });
  const sourceId = useWatch({ control: form.control, name: "source_id" });
  const zone = useWatch({ control: form.control, name: "availability_zone" });
  const size = useWatch({ control: form.control, name: "size" });
  const inherits = source === "snapshot" || source === "volume";
  const floor = sizeFloor(options.data, source, sourceId);

  // A source sets the minimum size; follow it up, never down.
  useEffect(() => {
    if (floor > 1 && size < floor) form.setValue("size", floor);
  }, [floor, size, form]);

  // Reset the source picker when the source kind changes, except on the
  // first render where the page handed us a source to start from.
  useEffect(() => {
    if (source !== (initialSource?.type ?? "none")) {
      form.setValue("source_id", "");
    } else if (initialSource) {
      form.setValue("source_id", initialSource.id);
    }
  }, [source, initialSource, form]);

  const types = useMemo(
    () => typesForZone(options.data, zone),
    [options.data, zone],
  );
  const available = gigabytesAvailable(options.data?.limits);

  const sourceOptions = useMemo(() => {
    const data = options.data;
    if (!data) return [];
    if (source === "image")
      return data.images.map((i) => ({
        id: i.id,
        label: `${i.name ?? i.id}${i.is_snapshot ? " (instance snapshot)" : ""}${i.size ? ` (${formatBytes(i.size)})` : ""}`,
      }));
    if (source === "snapshot")
      return data.snapshots.map((s) => ({
        id: s.id,
        label: `${s.name || s.id} (${formatGb(s.size_gb)})`,
      }));
    if (source === "volume")
      return data.volumes.map((v) => ({
        id: v.id,
        label: `${v.name || v.id} (${formatGb(v.size_gb)})`,
      }));
    return [];
  }, [options.data, source]);

  const reset = () => {
    form.reset();
    create.reset();
  };
  const submit = form.handleSubmit((values) => {
    if (values.size < floor) {
      form.setError("size", {
        message: `The volume size cannot be less than the source size (${floor} GB)`,
      });
      return;
    }
    if (available !== null && values.size > available) {
      form.setError("size", {
        message: `A ${values.size} GB volume cannot be created: ${available} GB of your quota is available`,
      });
      return;
    }
    const body: VolumeCreateRequest = { size: values.size };
    if (values.name) body.name = values.name;
    if (values.description) body.description = values.description;
    if (values.source !== "none") {
      body.source = { type: values.source, id: values.source_id };
    }
    if (!inherits) {
      body.availability_zone = values.availability_zone;
      if (values.volume_type) body.volume_type = values.volume_type;
    }
    create.mutate(body, {
      onSuccess: (created) => {
        notify.success(`Creating volume ${created.name || created.id}.`);
        reset();
        onOpenChange(false);
      },
    });
  });

  const sectionErrors = Object.entries(options.data?.errors ?? {});
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
      title="Create volume"
      submitLabel="Create volume"
      size="lg"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error ?? options.error}
    >
      {sectionErrors.length > 0 && (
        <Alert tone="warning" title="Some choices could not be loaded">
          <ul>
            {sectionErrors.map(([name, error]) => (
              <li key={name}>
                {name.replace(/_/g, " ")}: {error.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <TextInput control={form.control} name="name" label="Volume name" />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
      />
      <RadioInput
        control={form.control}
        name="source"
        label="Volume source"
        options={SOURCES}
      />
      {source !== "none" && (
        <SelectInput
          control={form.control}
          name="source_id"
          label={
            source === "image"
              ? "Image"
              : source === "snapshot"
                ? "Snapshot"
                : "Volume"
          }
          options={sourceOptions}
          isRequired
          isDisabled={options.isPending}
          placeholder={
            options.isPending
              ? "Loading..."
              : sourceOptions.length === 0
                ? "None available"
                : `Choose ${source === "image" ? "an image" : `a ${source}`}`
          }
          description={
            inherits
              ? "The new volume is created in the source's availability zone with the source's volume type."
              : undefined
          }
        />
      )}
      <NumberInput
        control={form.control}
        name="size"
        label="Size"
        addon="GB"
        minValue={floor}
        isRequired
        description={
          floor > 1
            ? `At least ${floor} GB for this source.`
            : "Whole gigabytes."
        }
      />
      {options.data && (
        <div className={styles.quota}>
          <QuotaMeter
            label="Volume storage"
            value={options.data.limits.totalGigabytesUsed ?? 0}
            max={options.data.limits.maxTotalVolumeGigabytes ?? null}
            valueText={`${formatGb(options.data.limits.totalGigabytesUsed ?? 0)} of ${available === null ? "unlimited" : formatGb(options.data.limits.maxTotalVolumeGigabytes ?? 0)} used`}
          />
          <QuotaMeter
            label="Volumes"
            value={options.data.limits.totalVolumesUsed ?? 0}
            max={options.data.limits.maxTotalVolumes ?? null}
          />
        </div>
      )}
      {!inherits && (
        <>
          <SelectInput
            control={form.control}
            name="availability_zone"
            label="Availability zone"
            options={(options.data?.availability_zones ?? [])
              .filter((z) => z.available)
              .map((z) => ({ id: z.name, label: z.name }))}
            isRequired
            isDisabled={options.isPending}
            placeholder={
              options.isPending ? "Loading..." : "Choose an availability zone"
            }
            description="Volumes can only be attached to instances in the same zone."
          />
          {zone && (
            <SelectInput
              control={form.control}
              name="volume_type"
              label="Volume type"
              options={[
                { id: "", label: "Default volume type" },
                ...types.map((t) => ({
                  id: t.name,
                  label: t.description
                    ? `${t.name} (${t.description})`
                    : t.name,
                })),
              ]}
              description={
                options.data?.has_zoned_types
                  ? `Showing the types available in ${zone}.`
                  : undefined
              }
            />
          )}
        </>
      )}
    </FormDialog>
  );
}

// --- edit --------------------------------------------------------------------

const editSchema = z.object({
  name: NAME,
  description: NAME,
  bootable: z.boolean(),
});

export function EditVolumeDialog({
  projectId,
  volume,
  onClose,
}: {
  projectId: string;
  volume: Volume;
  onClose: () => void;
}) {
  const update = useUpdateVolume(projectId);
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: volume.name,
      description: volume.description ?? "",
      bootable: volume.bootable,
    },
  });
  const submit = form.handleSubmit((values) => {
    const body: Parameters<typeof update.mutate>[0] = { volumeId: volume.id };
    if (values.name !== volume.name) body.name = values.name;
    if (values.description !== (volume.description ?? ""))
      body.description = values.description;
    if (values.bootable !== volume.bootable) body.bootable = values.bootable;
    if (Object.keys(body).length === 1) {
      onClose();
      return;
    }
    update.mutate(body, {
      onSuccess: (updated) => {
        notify.success(`Volume ${updated.name || updated.id} updated.`);
        onClose();
      },
    });
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Edit volume ${volume.name || volume.id}`}
      submitLabel="Save"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
    >
      <TextInput control={form.control} name="name" label="Volume name" />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
      />
      <SwitchInput
        control={form.control}
        name="bootable"
        label="Bootable (can be launched as an instance)"
      />
    </FormDialog>
  );
}

// --- extend ------------------------------------------------------------------

export function ExtendVolumeDialog({
  projectId,
  volume,
  onClose,
}: {
  projectId: string;
  volume: Volume;
  onClose: () => void;
}) {
  const limits = useQuery(volumeLimitsQuery(projectId));
  const extend = useExtendVolume(projectId);
  const current = volume.size_gb ?? 0;
  const available = gigabytesAvailable(limits.data);
  const schema = useMemo(
    () =>
      z.object({
        new_size: z
          .number()
          .int()
          .min(current + 1, `New size must be greater than ${current} GB`)
          .refine(
            (value) => available === null || value - current <= available,
            {
              message: `The volume can be extended to at most ${current + (available ?? 0)} GB with your remaining quota`,
            },
          ),
      }),
    [current, available],
  );
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { new_size: current + 1 },
  });
  const submit = form.handleSubmit((values) => {
    extend.mutate(
      { volumeId: volume.id, newSize: values.new_size },
      {
        onSuccess: () => {
          notify.success(
            `Extending volume ${volume.name || volume.id} to ${values.new_size} GB.`,
          );
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Extend volume ${volume.name || volume.id}`}
      submitLabel="Extend volume"
      onSubmit={submit}
      isPending={extend.isPending}
      error={extend.error}
    >
      <p>
        Current size: <strong>{formatGb(current)}</strong>.
        {available !== null && (
          <>
            {" "}
            You can add up to <strong>{formatGb(available)}</strong> within your
            quota.
          </>
        )}
      </p>
      <NumberInput
        control={form.control}
        name="new_size"
        label="New size"
        addon="GB"
        minValue={current + 1}
        isRequired
        description="A volume can grow but not shrink."
      />
    </FormDialog>
  );
}

// --- attachments -------------------------------------------------------------

const attachSchema = z.object({
  instance_id: z.string().min(1, "Choose an instance"),
  device: z
    .string()
    .trim()
    .max(255)
    .refine((value) => value === "" || value.startsWith("/dev/"), {
      message: "Device names start with /dev/",
    }),
});

const ATTACH_READY = new Set(["ACTIVE", "SHUTOFF"]);

export function ManageAttachmentsDialog({
  projectId,
  volume,
  onClose,
}: {
  projectId: string;
  volume: Volume;
  onClose: () => void;
}) {
  const formId = useId();
  const instances = useQuery(attachableInstancesQuery(projectId));
  const attach = useAttachVolume(projectId);
  const detach = useDetachVolume(projectId);
  const [detaching, setDetaching] = useState<string | null>(null);
  const form = useForm<z.infer<typeof attachSchema>>({
    resolver: zodResolver(attachSchema),
    defaultValues: { instance_id: "", device: "" },
  });
  const attached = new Set(volume.attachments.map((a) => a.server_id));
  const names = new Map(
    (instances.data?.items ?? []).map((i) => [i.id, i.name] as const),
  );
  const candidates = (instances.data?.items ?? []).filter(
    (i) => ATTACH_READY.has(i.status) && !attached.has(i.id),
  );
  const canAttach = volume.attachments.length === 0 || volume.multiattach;
  const busy = attach.isPending || detach.isPending;

  const submit = form.handleSubmit((values) => {
    attach.mutate(
      {
        volumeId: volume.id,
        instanceId: values.instance_id,
        ...(values.device ? { device: values.device } : {}),
      },
      {
        onSuccess: (result) => {
          notify.success(
            `Attaching volume ${volume.name || volume.id} to ${names.get(values.instance_id) ?? values.instance_id}${result.device ? ` on ${result.device}` : ""}.`,
          );
          onClose();
        },
      },
    );
  });

  const confirmDetach = (instanceId: string) => {
    detach.mutate(
      { volumeId: volume.id, instanceId },
      {
        onSuccess: () => {
          notify.success(
            `Detaching volume ${volume.name || volume.id} from ${names.get(instanceId) ?? instanceId}.`,
          );
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && !busy && onClose()}
      size="lg"
      isDismissable
    >
      <Dialog
        title={`Manage attachments for ${volume.name || volume.id}`}
        closeLabel="Close"
        actions={
          <>
            <Button variant="secondary" slot="close" isDisabled={busy}>
              Close
            </Button>
            {canAttach && attach.isPending ? (
              <Button
                variant="primary"
                state="loading"
                loadingText="Attaching..."
                isDisabled
              >
                Attach volume
              </Button>
            ) : canAttach ? (
              <Button
                variant="primary"
                type="submit"
                form={formId}
                isDisabled={busy || candidates.length === 0}
              >
                Attach volume
              </Button>
            ) : null}
          </>
        }
      >
        <div className={styles.attachments}>
          {attach.error || detach.error ? (
            <ErrorState
              error={attach.error ?? detach.error}
              title="Could not update attachments"
            />
          ) : null}
          <h3 className={styles.subheading}>Attached to</h3>
          {volume.attachments.length === 0 ? (
            <p className={styles.muted}>Not attached to any instance.</p>
          ) : (
            <ul className={styles.attachmentList}>
              {volume.attachments.map((attachment) => (
                <li key={attachment.id ?? attachment.server_id ?? ""}>
                  <span>
                    {attachmentLabel(
                      attachment,
                      attachment.server_id
                        ? names.get(attachment.server_id)
                        : undefined,
                    )}
                  </span>
                  {detaching === attachment.server_id ? (
                    <span className={styles.confirmDetach}>
                      <span>Detach?</span>
                      <Button
                        variant="secondary"
                        tone="danger"
                        size="xs"
                        isDisabled={busy}
                        onPress={() =>
                          attachment.server_id &&
                          confirmDetach(attachment.server_id)
                        }
                      >
                        Yes, detach
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        isDisabled={busy}
                        onPress={() => setDetaching(null)}
                      >
                        Keep
                      </Button>
                    </span>
                  ) : (
                    <Button
                      variant="secondary"
                      size="xs"
                      isDisabled={busy || !attachment.server_id}
                      onPress={() => setDetaching(attachment.server_id)}
                    >
                      Detach
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canAttach ? (
            <form
              id={formId}
              onSubmit={submit}
              noValidate
              className={styles.attachForm}
            >
              <h3 className={styles.subheading}>Attach to an instance</h3>
              <SelectInput
                control={form.control}
                name="instance_id"
                label="Instance"
                options={candidates.map((i) => ({
                  id: i.id,
                  label: `${i.name} (${i.status.toLowerCase()})`,
                }))}
                isRequired
                isDisabled={instances.isPending || candidates.length === 0}
                placeholder={
                  instances.isPending
                    ? "Loading instances..."
                    : candidates.length === 0
                      ? "No running or shut off instances to attach to"
                      : "Choose an instance"
                }
                description="Only active or shut off instances in the volume's zone can take a volume."
              />
              <TextInput
                control={form.control}
                name="device"
                label="Device name"
                description="Optional, such as /dev/vdc. The hypervisor may pick a different name."
              />
            </form>
          ) : (
            <p className={styles.muted}>
              Detach the volume before attaching it to another instance.
            </p>
          )}
        </div>
      </Dialog>
    </Modal>
  );
}

// --- snapshot ----------------------------------------------------------------

const snapshotSchema = z.object({ name: NAME, description: NAME });

export function CreateSnapshotDialog({
  projectId,
  volume,
  onClose,
}: {
  projectId: string;
  volume: Volume;
  onClose: () => void;
}) {
  const create = useCreateSnapshot(projectId);
  const form = useForm<z.infer<typeof snapshotSchema>>({
    resolver: zodResolver(snapshotSchema),
    defaultValues: { name: "", description: "" },
  });
  const submit = form.handleSubmit((values) => {
    create.mutate(
      {
        volume_id: volume.id,
        ...(values.name ? { name: values.name } : {}),
        ...(values.description ? { description: values.description } : {}),
      },
      {
        onSuccess: (snapshot) => {
          notify.success(
            `Creating snapshot ${snapshot.name || snapshot.id} of ${volume.name || volume.id}.`,
          );
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Create snapshot of ${volume.name || volume.id}`}
      submitLabel="Create snapshot"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      {volume.status === "in-use" && (
        <Alert tone="warning" title="The volume is attached">
          The snapshot is taken while the volume is in use. Data not yet written
          to disk by the instance will be missing from it.
        </Alert>
      )}
      <TextInput control={form.control} name="name" label="Snapshot name" />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
      />
    </FormDialog>
  );
}

// --- backup ------------------------------------------------------------------

const backupSchema = z.object({
  name: NAME.min(1, "Enter a name"),
  description: NAME,
  container: NAME.refine((value) => !value.includes("/"), {
    message: "A container name cannot contain a slash",
  }),
  snapshot_id: z.string(),
  incremental: z.boolean(),
});

export function CreateBackupDialog({
  projectId,
  volume,
  snapshotId,
  onClose,
}: {
  projectId: string;
  volume: Pick<Volume, "id" | "name" | "status">;
  snapshotId?: string | undefined;
  onClose: () => void;
}) {
  const snapshots = useQuery(snapshotsQuery(projectId));
  const create = useCreateBackup(projectId);
  const form = useForm<z.infer<typeof backupSchema>>({
    resolver: zodResolver(backupSchema),
    defaultValues: {
      name: "",
      description: "",
      container: "",
      snapshot_id: snapshotId ?? "",
      incremental: false,
    },
  });
  const forVolume = (snapshots.data?.items ?? []).filter(
    (s) => s.volume_id === volume.id && s.status === "available",
  );
  const submit = form.handleSubmit((values) => {
    create.mutate(
      {
        volume_id: volume.id,
        name: values.name,
        incremental: values.incremental,
        ...(values.description ? { description: values.description } : {}),
        ...(values.container ? { container: values.container } : {}),
        ...(values.snapshot_id ? { snapshot_id: values.snapshot_id } : {}),
      },
      {
        onSuccess: (backup) => {
          notify.success(`Creating backup ${backup.name || backup.id}.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Create backup of ${volume.name || volume.id}`}
      submitLabel="Create backup"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      {volume.status === "in-use" && !snapshotId && (
        <Alert tone="warning" title="The volume is attached">
          The backup is taken while the volume is in use. Back up a snapshot
          instead for a consistent copy.
        </Alert>
      )}
      <TextInput
        control={form.control}
        name="name"
        label="Backup name"
        isRequired
      />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
      />
      <TextInput
        control={form.control}
        name="container"
        label="Container"
        description="The object store container that holds the backup. Leave blank for the default."
      />
      <SelectInput
        control={form.control}
        name="snapshot_id"
        label="Snapshot to back up"
        options={[
          { id: "", label: "The volume itself" },
          ...forVolume.map((s) => ({
            id: s.id,
            label: `${s.name || s.id} (${formatGb(s.size_gb)})`,
          })),
        ]}
        isDisabled={snapshots.isPending}
        description="Back up a snapshot of this volume instead of its current contents."
      />
      <SwitchInput
        control={form.control}
        name="incremental"
        label="Incremental (store only what changed since the previous backup)"
      />
    </FormDialog>
  );
}

// --- upload to image ---------------------------------------------------------

const uploadSchema = z.object({
  image_name: NAME.min(1, "Enter an image name"),
  disk_format: z.enum(["raw", "qcow2", "vmdk", "vdi"]),
  force: z.boolean(),
});

export function UploadToImageDialog({
  projectId,
  volume,
  onClose,
}: {
  projectId: string;
  volume: Volume;
  onClose: () => void;
}) {
  const upload = useUploadToImage(projectId);
  const form = useForm<z.infer<typeof uploadSchema>>({
    resolver: zodResolver(uploadSchema),
    defaultValues: { image_name: "", disk_format: "raw", force: false },
  });
  const submit = form.handleSubmit((values) => {
    upload.mutate(
      { volumeId: volume.id, ...values },
      {
        onSuccess: () => {
          notify.success(
            `Uploading volume ${volume.name || volume.id} to image ${values.image_name}. It appears under Images once the copy finishes.`,
          );
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Upload ${volume.name || volume.id} to an image`}
      submitLabel="Upload to image"
      onSubmit={submit}
      isPending={upload.isPending}
      error={upload.error}
    >
      <TextInput
        control={form.control}
        name="image_name"
        label="Image name"
        isRequired
      />
      <SelectInput
        control={form.control}
        name="disk_format"
        label="Disk format"
        options={["raw", "qcow2", "vmdk", "vdi"].map((format) => ({
          id: format,
          label: format.toUpperCase(),
        }))}
      />
      {volume.status === "in-use" && (
        <SwitchInput
          control={form.control}
          name="force"
          label="Upload while attached (the image may miss data the instance has not written yet)"
        />
      )}
    </FormDialog>
  );
}
