// Share snapshot dialogs: edit name and description, and add a snapshot
// access rule (manila-ui share_snapshots/forms.py).
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  SelectInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import type { ShareSnapshot } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import {
  shareOptionsQuery,
  useSnapshotAllowAccess,
  useUpdateSnapshot,
} from "./api";
import { accessTypeOptions, defaultAccessType } from "./status";

const editSchema = z.object({
  name: z.string().trim().min(1, "Enter a snapshot name").max(255),
  description: z.string().trim().max(255),
});

export function EditSnapshotDialog({
  projectId,
  snapshot,
  onClose,
}: {
  projectId: string;
  snapshot: ShareSnapshot;
  onClose: () => void;
}) {
  const update = useUpdateSnapshot(projectId);
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
          notify.success(`Snapshot ${values.name} has been updated.`);
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

const ruleSchema = z.object({
  access_type: z.string().min(1, "Choose an access type"),
  access_to: z.string().trim().min(1, "Enter who to grant access to").max(255),
});

export function SnapshotAccessDialog({
  projectId,
  snapshot,
  onClose,
}: {
  projectId: string;
  snapshot: ShareSnapshot;
  onClose: () => void;
}) {
  const options = useQuery(shareOptionsQuery(projectId));
  const allow = useSnapshotAllowAccess(projectId);
  // CephFS snapshots take CephX users, as share rules do.
  const accessType = defaultAccessType(snapshot.share_proto);
  const form = useForm<z.infer<typeof ruleSchema>>({
    resolver: zodResolver(ruleSchema),
    defaultValues: { access_type: accessType, access_to: "" },
  });
  const submit = form.handleSubmit((values) => {
    allow.mutate(
      { snapshotId: snapshot.id, ...values },
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
      title="Add snapshot access rule"
      submitLabel="Add rule"
      onSubmit={submit}
      isPending={allow.isPending}
      error={allow.error}
    >
      <SelectInput
        control={form.control}
        name="access_type"
        label="Access type"
        options={accessTypeOptions(options.data?.access_types ?? [accessType])}
        isRequired
      />
      <TextInput
        control={form.control}
        name="access_to"
        label="Access to"
        isRequired
      />
    </FormDialog>
  );
}
