// Share group and share group snapshot forms (manila-ui share_groups and
// share_group_snapshots forms.py).
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loading } from "@ardc-ui/react";
import {
  CheckboxesInput,
  SelectInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import type { ShareGroup, ShareGroupSnapshot } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import {
  shareGroupSnapshotsQuery,
  shareOptionsQuery,
  useCreateShareGroup,
  useCreateShareGroupSnapshot,
  useUpdateShareGroup,
  useUpdateShareGroupSnapshot,
} from "./api";
import { createShareGroupSchema, useShareTypesReset } from "./shareForms";

export function CreateShareGroupDialog({
  projectId,
  snapshotId,
  onClose,
}: {
  projectId: string;
  snapshotId: string | null;
  onClose: () => void;
}) {
  const options = useQuery(shareOptionsQuery(projectId));
  const snapshots = useQuery(shareGroupSnapshotsQuery(projectId));
  const create = useCreateShareGroup(projectId);
  const form = useForm<z.infer<typeof createShareGroupSchema>>({
    resolver: zodResolver(createShareGroupSchema),
    defaultValues: {
      name: "",
      description: "",
      snapshot_id: snapshotId ?? "",
      share_group_type_id: "",
      share_types: [],
      availability_zone: "",
    },
  });
  const [chosenSnapshot, groupType] = useWatch({
    control: form.control,
    name: ["snapshot_id", "share_group_type_id"],
  });
  useShareTypesReset(form);
  const data = options.data;
  const groupTypes = data?.share_group_types ?? [];
  const allowedTypes =
    groupTypes.find((g) => g.id === groupType)?.share_types ?? [];
  const availableSnapshots = (snapshots.data?.items ?? []).filter(
    (s) => (s.status ?? "").toLowerCase() === "available",
  );
  const submit = form.handleSubmit((values) => {
    create.mutate(
      {
        name: values.name,
        ...(values.description ? { description: values.description } : {}),
        ...(values.snapshot_id
          ? { snapshot_id: values.snapshot_id }
          : {
              share_group_type_id: values.share_group_type_id,
              ...(values.share_types.length
                ? { share_types: values.share_types }
                : {}),
            }),
        ...(values.availability_zone
          ? { availability_zone: values.availability_zone }
          : {}),
      },
      {
        onSuccess: () => {
          notify.success(`Share group ${values.name} is being created.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Create share group"
      submitLabel="Create share group"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      {options.isPending ? (
        <Loading>Loading share group options...</Loading>
      ) : (
        <>
          <TextInput
            control={form.control}
            name="name"
            label="Name"
            isRequired
          />
          <TextAreaInput
            control={form.control}
            name="description"
            label="Description"
            rows={2}
          />
          {availableSnapshots.length > 0 && (
            <SelectInput
              control={form.control}
              name="snapshot_id"
              label="Source"
              options={[
                { id: "", label: "No source, empty share group" },
                ...availableSnapshots.map((s) => ({
                  id: s.id,
                  label: `Snapshot ${s.name || s.id}`,
                })),
              ]}
            />
          )}
          {!chosenSnapshot && (
            <>
              <SelectInput
                control={form.control}
                name="share_group_type_id"
                label="Share group type"
                options={groupTypes.map((g) => ({
                  id: g.id,
                  label: g.name || g.id,
                }))}
                isRequired
              />
              {allowedTypes.length > 0 && (
                <CheckboxesInput
                  control={form.control}
                  name="share_types"
                  label="Share types"
                  description="Shares in the group may use these types."
                  options={allowedTypes.map((id) => ({
                    id,
                    label:
                      data?.share_types.find((t) => t.id === id)?.name ?? id,
                  }))}
                />
              )}
            </>
          )}
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
        </>
      )}
    </FormDialog>
  );
}

const editSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(255),
  description: z.string().trim().max(255),
});

export function EditShareGroupDialog({
  projectId,
  group,
  onClose,
}: {
  projectId: string;
  group: ShareGroup;
  onClose: () => void;
}) {
  const update = useUpdateShareGroup(projectId);
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: group.name ?? "",
      description: group.description ?? "",
    },
  });
  const submit = form.handleSubmit((values) => {
    update.mutate(
      { id: group.id, ...values },
      {
        onSuccess: () => {
          notify.success(`Share group ${values.name} has been updated.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Edit ${group.name || group.id}`}
      submitLabel="Save"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
    >
      <TextInput control={form.control} name="name" label="Name" isRequired />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
        rows={2}
      />
    </FormDialog>
  );
}

export function CreateShareGroupSnapshotDialog({
  projectId,
  group,
  onClose,
}: {
  projectId: string;
  group: ShareGroup;
  onClose: () => void;
}) {
  const create = useCreateShareGroupSnapshot(projectId);
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: `${group.name || group.id}-snapshot`,
      description: "",
    },
  });
  const submit = form.handleSubmit((values) => {
    create.mutate(
      {
        share_group_id: group.id,
        name: values.name,
        ...(values.description ? { description: values.description } : {}),
      },
      {
        onSuccess: () => {
          notify.success(
            `Share group snapshot ${values.name} is being created.`,
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
      title={`Create snapshot of ${group.name || group.id}`}
      submitLabel="Create snapshot"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
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

export function EditShareGroupSnapshotDialog({
  projectId,
  snapshot,
  onClose,
}: {
  projectId: string;
  snapshot: ShareGroupSnapshot;
  onClose: () => void;
}) {
  const update = useUpdateShareGroupSnapshot(projectId);
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: snapshot.name ?? "",
      description: snapshot.description ?? "",
    },
  });
  const submit = form.handleSubmit((values) => {
    update.mutate(
      { id: snapshot.id, ...values },
      {
        onSuccess: () => {
          notify.success(
            `Share group snapshot ${values.name} has been updated.`,
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
      title={`Edit ${snapshot.name || snapshot.id}`}
      submitLabel="Save"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
    >
      <TextInput control={form.control} name="name" label="Name" isRequired />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
        rows={2}
      />
    </FormDialog>
  );
}
