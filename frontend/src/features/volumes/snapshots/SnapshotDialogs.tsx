import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import { TextAreaInput, TextInput } from "../../../components/Form/fields";
import type { VolumeSnapshot } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import { useUpdateSnapshot } from "../api";

const schema = z.object({
  name: z.string().trim().max(255, "At most 255 characters"),
  description: z.string().trim().max(255, "At most 255 characters"),
});

export function EditSnapshotDialog({
  projectId,
  snapshot,
  onClose,
}: {
  projectId: string;
  snapshot: VolumeSnapshot;
  onClose: () => void;
}) {
  const update = useUpdateSnapshot(projectId);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: snapshot.name,
      description: snapshot.description ?? "",
    },
  });
  const submit = form.handleSubmit((values) => {
    const body: Parameters<typeof update.mutate>[0] = {
      snapshotId: snapshot.id,
    };
    if (values.name !== snapshot.name) body.name = values.name;
    if (values.description !== (snapshot.description ?? ""))
      body.description = values.description;
    if (Object.keys(body).length === 1) {
      onClose();
      return;
    }
    update.mutate(body, {
      onSuccess: (updated) => {
        notify.success(`Snapshot ${updated.name || updated.id} updated.`);
        onClose();
      },
    });
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Edit snapshot ${snapshot.name || snapshot.id}`}
      submitLabel="Save"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
    >
      <TextInput control={form.control} name="name" label="Snapshot name" />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
      />
    </FormDialog>
  );
}
