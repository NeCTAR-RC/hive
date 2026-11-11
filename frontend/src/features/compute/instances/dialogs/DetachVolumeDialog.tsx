// Detach a volume from the instance's menu: Horizon's DetachVolume row
// action. The Volumes tab detaches a volume from its own row instead.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { formatGb } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { useDetachVolume } from "../../../volumes/api";
import { instanceVolumesQuery } from "../../api";
import type { InstanceDialogProps } from "./props";

const detachSchema = z.object({
  volume_id: z.string().min(1, "Choose a volume"),
});

/**
 * Detaches one of the volumes attached to the instance, each named with
 * its device and size. The data stays on the volume.
 */
export function DetachVolumeDialog({ instance, onClose }: InstanceDialogProps) {
  const projectId = useProjectId();
  const volumes = useQuery(instanceVolumesQuery(projectId, instance.id));
  const attached = useMemo(() => volumes.data?.items ?? [], [volumes.data]);
  // A sole volume needs no choosing once the list loads.
  const initial = useMemo(
    () => ({
      volume_id: attached.length === 1 ? (attached[0]?.id ?? "") : "",
    }),
    [attached],
  );
  const { SelectInput } = fieldsFor<z.infer<typeof detachSchema>>();
  const { dialog } = useMutationForm({
    schema: detachSchema,
    values: initial,
    mutation: useDetachVolume(),
    toVariables: (values) => ({
      volumeId: values.volume_id,
      instanceId: instance.id,
    }),
    successMessage: (_result, values) => {
      const volume = attached.find((v) => v.id === values.volume_id);
      return `Detaching volume ${volume?.name ?? values.volume_id} from ${instance.name}.`;
    },
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? volumes.error}
      title={`Detach a volume from ${instance.name}`}
      submitLabel="Detach volume"
      submitTone="danger"
    >
      <p>
        The data stays on the volume, and another instance can attach it
        afterwards. Unmount the volume inside the instance first.
      </p>
      <SelectInput
        name="volume_id"
        label="Volume"
        options={attached.map((v) => ({
          id: v.id,
          label: `${v.name}${v.device ? ` on ${v.device}` : ""} (${formatGb(v.size_gb)})`,
        }))}
        isRequired
        isDisabled={volumes.isPending || attached.length === 0}
        placeholder={
          volumes.isPending
            ? "Loading volumes..."
            : attached.length === 0
              ? "No volumes attached"
              : "Choose a volume"
        }
      />
    </FormDialog>
  );
}
