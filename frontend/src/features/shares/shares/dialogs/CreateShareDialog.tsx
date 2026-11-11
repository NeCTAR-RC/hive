// The create share dialog (manila-ui shares/forms.py).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@ardc-ui/react";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { maxLength } from "../../../../lib/validation";
import { shareOptionsQuery, useCreateShare } from "../../api";
import {
  createShareBody,
  METADATA_HINT,
  shareSizeError,
  storageLeft,
} from "../request";

/** The create form; the size must fit the `left` GiB of share storage. */
function createSchema(left: number | null) {
  return z
    .object({
      name: maxLength(255).min(1, "Enter a share name"),
      description: maxLength(255),
      protocol: z.string().min(1, "Choose a protocol"),
      size: z.number().int().min(1, "At least 1 GiB"),
      share_type: z.string().min(1, "Choose a share type"),
      availability_zone: z.string(),
      share_group_id: z.string(),
      snapshot_id: z.string(),
      metadata: z.string(),
      is_public: z.boolean(),
    })
    .superRefine((values, ctx) => {
      const message = shareSizeError(values.size, left);
      if (message) ctx.addIssue({ code: "custom", path: ["size"], message });
    });
}

/**
 * Creates a share, empty or from one of the project's snapshots
 * (`snapshotId`, preselected when the snapshots page links here). The
 * pickers come from the share options; a project that cannot create a
 * share is told why above the form, and the size must fit the share
 * storage left. The protocol picker shows only when the cloud offers more
 * than one, and the public switch only where members may use it.
 */
export function CreateShareDialog({
  snapshotId,
  onClose,
}: {
  snapshotId: string | null;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(shareOptionsQuery(projectId));
  const data = options.data;
  // Defaults once the pickers arrive (forms.py:88-110): the first
  // protocol, the only share type and zone, and a snapshot source's size.
  const preselected = useMemo(() => {
    const source = data?.snapshots.find((s) => s.id === snapshotId);
    return {
      name: "",
      description: "",
      protocol: data?.protocols[0] ?? "",
      size: source ? Math.max(1, source.size) : 1,
      share_type:
        data?.share_types.length === 1 ? (data.share_types[0]?.name ?? "") : "",
      availability_zone:
        data?.availability_zones.length === 1
          ? (data.availability_zones[0] ?? "")
          : "",
      share_group_id: "",
      snapshot_id: snapshotId ?? "",
      metadata: "",
      is_public: false,
    };
  }, [data, snapshotId]);
  const left = storageLeft(data?.quota);
  const schema = useMemo(() => createSchema(left), [left]);
  const { NumberInput, SelectInput, SwitchInput, TextAreaInput, TextInput } =
    fieldsFor<z.infer<ReturnType<typeof createSchema>>>();
  const { form, dialog } = useMutationForm({
    schema,
    values: preselected,
    mutation: useCreateShare(),
    toVariables: createShareBody,
    successMessage: (share) => `Share ${share.name} is being created.`,
    onDone: onClose,
  });
  const chosenSnapshot = useWatch({
    control: form.control,
    name: "snapshot_id",
  });
  const snapshot = data?.snapshots.find((s) => s.id === chosenSnapshot);
  // Choosing a snapshot source raises the size to at least the snapshot's
  // (forms.py:88-110); marked dirty so a refetch of the options keeps it.
  const raiseSizeTo = (snapshotId: string) => {
    const source = data?.snapshots.find((s) => s.id === snapshotId);
    if (source && form.getValues("size") < source.size) {
      form.setValue("size", source.size, { shouldDirty: true });
    }
  };

  const sizeHint = [
    snapshot ? `At least the snapshot size (${snapshot.size} GiB).` : "",
    left !== null ? `${left} GiB left.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <FormDialog
      {...dialog}
      title="Create share"
      submitLabel="Create share"
      isSubmitDisabled={data !== undefined && !data.can_create}
    >
      {options.isPending ? (
        <SkeletonLines lines={6} />
      ) : (
        <>
          {data && !data.can_create && (
            <Alert tone="warning" role="status">
              {data.create_reason}
            </Alert>
          )}
          <TextInput name="name" label="Share name" isRequired />
          <TextAreaInput name="description" label="Description" />
          {data && data.snapshots.length > 0 && (
            <SelectInput
              name="snapshot_id"
              label="Source"
              onValueChange={raiseSizeTo}
              options={[
                { id: "", label: "No source, empty share" },
                ...data.snapshots.map((s) => ({
                  id: s.id,
                  label: `Snapshot ${s.name || s.id} (${s.size} GiB)`,
                })),
              ]}
            />
          )}
          {data && data.protocols.length > 1 && (
            <SelectInput
              name="protocol"
              label="Share protocol"
              options={data.protocols.map((p) => ({ id: p, label: p }))}
              isRequired
            />
          )}
          <NumberInput
            name="size"
            label="Size"
            addon="GiB"
            minValue={snapshot ? snapshot.size : 1}
            isRequired
            {...(sizeHint ? { description: sizeHint } : {})}
          />
          <SelectInput
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
            name="metadata"
            label="Metadata"
            description={METADATA_HINT}
          />
          {data?.public_shares_allowed && (
            <SwitchInput
              name="is_public"
              label="Make visible to users from all projects"
            />
          )}
        </>
      )}
    </FormDialog>
  );
}
