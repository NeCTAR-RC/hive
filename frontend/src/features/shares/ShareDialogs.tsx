// Share dialogs (manila-ui shares/forms.py): create, edit, metadata,
// resize, revert, access rule and snapshot.
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Loading } from "@ardc-ui/react";
import {
  NumberInput,
  SelectInput,
  SwitchInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import type { Share } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import {
  shareOptionsQuery,
  useAllowAccess,
  useCreateShare,
  useCreateSnapshot,
  useResizeShare,
  useRevertShare,
  useSetShareMetadata,
  useUpdateShare,
} from "./api";
import {
  createDefaults,
  createShareSchema,
  newestSnapshot,
  useSnapshotSizePin,
  type CreateShareValues,
} from "./shareForms";
import {
  accessLevelOptions,
  accessTypeOptions,
  defaultAccessType,
  formatMetadata,
} from "./status";

const METADATA_HINT = "One key=value pair per line.";

export function CreateShareDialog({
  projectId,
  snapshotId,
  onClose,
}: {
  projectId: string;
  snapshotId: string | null;
  onClose: () => void;
}) {
  const options = useQuery(shareOptionsQuery(projectId));
  const create = useCreateShare(projectId);
  const data = options.data;
  // Defaults follow the pickers once they arrive, without overwriting what
  // the user has already chosen.
  const form = useForm<CreateShareValues>({
    resolver: zodResolver(createShareSchema),
    values: createDefaults(data, snapshotId),
    resetOptions: { keepDirtyValues: true },
  });
  const chosenSnapshot = useWatch({
    control: form.control,
    name: "snapshot_id",
  });
  const snapshot = data?.snapshots.find((s) => s.id === chosenSnapshot);

  useSnapshotSizePin(form, data);

  const submit = form.handleSubmit((values) => {
    create.mutate(
      {
        name: values.name,
        protocol: values.protocol,
        size: values.size,
        share_type: values.share_type,
        is_public: values.is_public,
        ...(values.description ? { description: values.description } : {}),
        ...(values.availability_zone
          ? { availability_zone: values.availability_zone }
          : {}),
        ...(values.share_group_id
          ? { share_group_id: values.share_group_id }
          : {}),
        ...(values.snapshot_id ? { snapshot_id: values.snapshot_id } : {}),
        ...(values.metadata.trim() ? { metadata: values.metadata } : {}),
      },
      {
        onSuccess: (share) => {
          notify.success(`Share ${share.name} is being created.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Create share"
      submitLabel="Create share"
      onSubmit={submit}
      isPending={create.isPending}
      isSubmitDisabled={!data?.can_create}
      error={create.error}
    >
      {options.isPending ? (
        <Loading>Loading share options...</Loading>
      ) : (
        <>
          {data && !data.can_create && (
            <Alert tone="warning" role="status">
              {data.create_reason}
            </Alert>
          )}
          <TextInput
            control={form.control}
            name="name"
            label="Share name"
            isRequired
          />
          <TextAreaInput
            control={form.control}
            name="description"
            label="Description"
            rows={2}
          />
          {data && data.snapshots.length > 0 && (
            <SelectInput
              control={form.control}
              name="snapshot_id"
              label="Source"
              options={[
                { id: "", label: "No source, empty share" },
                ...data.snapshots.map((s) => ({
                  id: s.id,
                  label: `Snapshot ${s.name || s.id} (${s.size} GiB)`,
                })),
              ]}
            />
          )}
          <SelectInput
            control={form.control}
            name="protocol"
            label="Share protocol"
            options={(data?.protocols ?? []).map((p) => ({ id: p, label: p }))}
            isRequired
          />
          <NumberInput
            control={form.control}
            name="size"
            label="Size"
            addon="GiB"
            minValue={snapshot ? snapshot.size : 1}
            isRequired
            {...(snapshot
              ? {
                  description: `At least the snapshot size (${snapshot.size} GiB).`,
                }
              : {})}
          />
          <SelectInput
            control={form.control}
            name="share_type"
            label="Share type"
            options={(data?.share_types ?? []).map((t) => ({
              id: t.name ?? t.id,
              label: t.name ?? t.id,
              ...(t.description ? { description: t.description } : {}),
            }))}
            isRequired
          />
          <SelectInput
            control={form.control}
            name="availability_zone"
            label="Availability zone"
            options={[
              { id: "", label: "Any" },
              ...(data?.availability_zones ?? []).map((z) => ({
                id: z,
                label: z,
              })),
            ]}
          />
          {data && data.share_groups.length > 0 && (
            <SelectInput
              control={form.control}
              name="share_group_id"
              label="Share group"
              options={[
                { id: "", label: "None" },
                ...data.share_groups.map((g) => ({
                  id: g.id,
                  label: g.name || g.id,
                })),
              ]}
            />
          )}
          <TextAreaInput
            control={form.control}
            name="metadata"
            label="Metadata"
            description={METADATA_HINT}
            rows={2}
            monospace
          />
          <SwitchInput
            control={form.control}
            name="is_public"
            label="Make visible to users from all projects"
          />
        </>
      )}
    </FormDialog>
  );
}

const editSchema = z.object({
  name: z.string().trim().min(1, "Enter a share name").max(255),
  description: z.string().trim().max(255),
  is_public: z.boolean(),
});

export function EditShareDialog({
  projectId,
  share,
  onClose,
}: {
  projectId: string;
  share: Share;
  onClose: () => void;
}) {
  const update = useUpdateShare(projectId);
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: share.name ?? "",
      description: share.description ?? "",
      is_public: share.is_public,
    },
  });
  const submit = form.handleSubmit((values) => {
    update.mutate(
      { id: share.id, ...values },
      {
        onSuccess: () => {
          notify.success(`Share ${values.name} has been updated.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Edit ${share.name || share.id}`}
      submitLabel="Save"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
    >
      <TextInput
        control={form.control}
        name="name"
        label="Share name"
        isRequired
      />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
        rows={2}
      />
      <SwitchInput
        control={form.control}
        name="is_public"
        label="Make visible to users from all projects"
      />
    </FormDialog>
  );
}

const metadataSchema = z.object({ metadata: z.string() });

export function MetadataDialog({
  projectId,
  share,
  onClose,
}: {
  projectId: string;
  share: Share;
  onClose: () => void;
}) {
  const set = useSetShareMetadata(projectId);
  const form = useForm<z.infer<typeof metadataSchema>>({
    resolver: zodResolver(metadataSchema),
    defaultValues: { metadata: formatMetadata(share.metadata) },
  });
  const submit = form.handleSubmit((values) => {
    set.mutate(
      { id: share.id, metadata: values.metadata },
      {
        onSuccess: () => {
          notify.success(
            `Metadata of ${share.name || share.id} has been updated.`,
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
      title={`Edit metadata of ${share.name || share.id}`}
      submitLabel="Save"
      onSubmit={submit}
      isPending={set.isPending}
      error={set.error}
    >
      <TextAreaInput
        control={form.control}
        name="metadata"
        label="Metadata"
        description={`${METADATA_HINT} Keys left out are removed.`}
        rows={6}
        monospace
      />
    </FormDialog>
  );
}

const resizeSchema = z.object({
  size: z.number().int().min(1, "At least 1 GiB"),
});

export function ResizeShareDialog({
  projectId,
  share,
  onClose,
}: {
  projectId: string;
  share: Share;
  onClose: () => void;
}) {
  const resize = useResizeShare(projectId);
  const form = useForm<z.infer<typeof resizeSchema>>({
    resolver: zodResolver(resizeSchema),
    defaultValues: { size: share.size ?? 1 },
  });
  const submit = form.handleSubmit((values) => {
    resize.mutate(
      { id: share.id, size: values.size },
      {
        onSuccess: () => {
          notify.success(
            `Share ${share.name || share.id} is being ${values.size > (share.size ?? 0) ? "extended" : "shrunk"} to ${values.size} GiB.`,
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
      title={`Resize ${share.name || share.id}`}
      submitLabel="Resize"
      onSubmit={submit}
      isPending={resize.isPending}
      error={resize.error}
    >
      <p>The share is currently {share.size} GiB.</p>
      <NumberInput
        control={form.control}
        name="size"
        label="New size"
        addon="GiB"
        minValue={1}
        isRequired
        description="Shrinking a share below its used space can lose data."
      />
    </FormDialog>
  );
}

const revertSchema = z.object({
  snapshot_id: z.string().min(1, "Choose a snapshot"),
});

export function RevertShareDialog({
  projectId,
  share,
  onClose,
}: {
  projectId: string;
  share: Share;
  onClose: () => void;
}) {
  const options = useQuery(shareOptionsQuery(projectId));
  const revert = useRevertShare(projectId);
  const newest = newestSnapshot(share, options.data);
  const form = useForm<z.infer<typeof revertSchema>>({
    resolver: zodResolver(revertSchema),
    values: { snapshot_id: newest?.id ?? "" },
  });
  const submit = form.handleSubmit((values) => {
    revert.mutate(
      { id: share.id, snapshotId: values.snapshot_id },
      {
        onSuccess: () => {
          notify.success(`Share ${share.name || share.id} is being reverted.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Revert ${share.name || share.id}`}
      submitLabel="Revert"
      submitTone="danger"
      onSubmit={submit}
      isPending={revert.isPending}
      isSubmitDisabled={!newest}
      error={revert.error}
    >
      {options.isPending ? (
        <Loading>Loading snapshots...</Loading>
      ) : (
        <>
          <p>
            Only the newest snapshot can be reverted to. Changes since it are
            lost.
          </p>
          {!newest && (
            <Alert tone="warning" role="status">
              The share has no available snapshot to revert to.
            </Alert>
          )}
          <SelectInput
            control={form.control}
            name="snapshot_id"
            label="Snapshot"
            options={newest ? [newest] : []}
            isRequired
          />
        </>
      )}
    </FormDialog>
  );
}

const ruleSchema = z.object({
  access_type: z.string().min(1, "Choose an access type"),
  access_to: z.string().trim().min(1, "Enter who to grant access to").max(255),
  access_level: z.string().min(1),
});

export function AccessRuleDialog({
  projectId,
  share,
  onClose,
}: {
  projectId: string;
  share: Share;
  onClose: () => void;
}) {
  const options = useQuery(shareOptionsQuery(projectId));
  const allow = useAllowAccess(projectId);
  const form = useForm<z.infer<typeof ruleSchema>>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      access_type: defaultAccessType(share.protocol),
      access_to: "",
      access_level: "rw",
    },
  });
  const submit = form.handleSubmit((values) => {
    allow.mutate(
      { shareId: share.id, ...values },
      {
        onSuccess: () => {
          notify.success(`Access rule for ${values.access_to} is being added.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Add access rule"
      submitLabel="Add rule"
      onSubmit={submit}
      isPending={allow.isPending}
      error={allow.error}
    >
      <SelectInput
        control={form.control}
        name="access_type"
        label="Access type"
        options={accessTypeOptions(
          options.data?.access_types ?? [defaultAccessType(share.protocol)],
        )}
        isRequired
      />
      <TextInput
        control={form.control}
        name="access_to"
        label="Access to"
        description="An IP address or network, a user name, a certificate CN or a CephX user."
        isRequired
      />
      <SelectInput
        control={form.control}
        name="access_level"
        label="Access level"
        options={accessLevelOptions(options.data?.access_levels ?? ["rw"])}
        isRequired
      />
    </FormDialog>
  );
}

const snapshotSchema = z.object({
  name: z.string().trim().min(1, "Enter a snapshot name").max(255),
  description: z.string().trim().max(255),
});

export function CreateSnapshotDialog({
  projectId,
  share,
  onClose,
}: {
  projectId: string;
  share: Share;
  onClose: () => void;
}) {
  const options = useQuery(shareOptionsQuery(projectId));
  const create = useCreateSnapshot(projectId);
  const form = useForm<z.infer<typeof snapshotSchema>>({
    resolver: zodResolver(snapshotSchema),
    defaultValues: {
      name: `${share.name || share.id}-snapshot`,
      description: "",
    },
  });
  const submit = form.handleSubmit((values) => {
    create.mutate(
      {
        share_id: share.id,
        name: values.name,
        ...(values.description ? { description: values.description } : {}),
      },
      {
        onSuccess: () => {
          notify.success(`Snapshot ${values.name} is being created.`);
          onClose();
        },
      },
    );
  });
  const blocked = options.data && !options.data.can_snapshot;
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Create snapshot of ${share.name || share.id}`}
      submitLabel="Create snapshot"
      onSubmit={submit}
      isPending={create.isPending}
      isSubmitDisabled={!options.data?.can_snapshot}
      error={create.error}
    >
      {blocked && (
        <Alert tone="warning" role="status">
          {options.data?.snapshot_reason}
        </Alert>
      )}
      <p>The snapshot captures the share's {share.size} GiB as they are now.</p>
      <TextInput
        control={form.control}
        name="name"
        label="Snapshot name"
        isRequired
      />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
        rows={2}
      />
    </FormDialog>
  );
}
