// Attach a volume to the instance, from its menu or its Volumes tab.
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { formatGb } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { useAttachVolume, volumesQuery } from "../../../volumes/api";
import type { InstanceDialogProps } from "./props";
import { maxLength } from "../../../../lib/validation";

const schema = z.object({
  volume_id: z.string().min(1, "Choose a volume"),
  device: maxLength(255).refine(
    (value) => value === "" || value.startsWith("/dev/"),
    {
      message: "Device names start with /dev/",
    },
  ),
});

/**
 * Attaches an available volume to the instance, optionally at a device
 * name. Volumes in another zone are listed but disabled, since Nova
 * attaches a volume only in its own zone.
 */
export function AttachVolumeDialog({ instance, onClose }: InstanceDialogProps) {
  const projectId = useProjectId();
  const volumes = useQuery(volumesQuery(projectId));
  // Only an available volume in the instance's zone can be attached.
  const candidates = (volumes.data?.items ?? []).filter(
    (v) => v.status === "available",
  );
  const { SelectInput, TextInput } = fieldsFor<z.infer<typeof schema>>();
  const { dialog } = useMutationForm({
    schema,
    defaultValues: { volume_id: "", device: "" },
    mutation: useAttachVolume(),
    toVariables: (values) => ({
      volumeId: values.volume_id,
      instanceId: instance.id,
      ...(values.device ? { device: values.device } : {}),
    }),
    successMessage: (result, values) => {
      const volume = candidates.find((v) => v.id === values.volume_id);
      return `Attaching volume ${volume?.name || values.volume_id} to ${instance.name}${result.device ? ` on ${result.device}` : ""}.`;
    },
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? volumes.error}
      title={`Attach volume to ${instance.name}`}
      submitLabel="Attach volume"
    >
      <SelectInput
        name="volume_id"
        label="Volume"
        options={candidates.map((v) => {
          const sameZone =
            !instance.availability_zone ||
            v.availability_zone === instance.availability_zone;
          return {
            id: v.id,
            label: `${v.name || v.id} (${formatGb(v.size_gb)}, ${v.availability_zone ?? "no zone"})${sameZone ? "" : " - different zone"}`,
            isDisabled: !sameZone,
          };
        })}
        isRequired
        isDisabled={volumes.isPending || candidates.length === 0}
        placeholder={
          volumes.isPending
            ? "Loading volumes..."
            : candidates.length === 0
              ? "No available volumes"
              : "Choose a volume"
        }
        description="Only available volumes in the instance's availability zone can be attached."
      />
      <TextInput
        name="device"
        label="Device name"
        description="Optional, such as /dev/vdc. The hypervisor may pick a different name."
      />
    </FormDialog>
  );
}
