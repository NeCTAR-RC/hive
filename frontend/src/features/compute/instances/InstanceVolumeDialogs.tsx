// Attach a volume from the instance's Volumes tab; detaching is a
// confirmation on the tab itself.
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import { SelectInput, TextInput } from "../../../components/Form/fields";
import type { InstanceDetail } from "../../../lib/api/types";
import { formatGb } from "../../../lib/format";
import { notify } from "../../../lib/notify";
import { useAttachVolume, volumesQuery } from "../../volumes/api";

const schema = z.object({
  volume_id: z.string().min(1, "Choose a volume"),
  device: z
    .string()
    .trim()
    .max(255)
    .refine((value) => value === "" || value.startsWith("/dev/"), {
      message: "Device names start with /dev/",
    }),
});

export function AttachVolumeDialog({
  projectId,
  instance,
  onClose,
}: {
  projectId: string;
  instance: InstanceDetail;
  onClose: () => void;
}) {
  const volumes = useQuery(volumesQuery(projectId));
  const attach = useAttachVolume(projectId);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { volume_id: "", device: "" },
  });
  // Only an available volume in the instance's zone can be attached.
  const candidates = (volumes.data?.items ?? []).filter(
    (v) => v.status === "available",
  );
  const submit = form.handleSubmit((values) => {
    attach.mutate(
      {
        volumeId: values.volume_id,
        instanceId: instance.id,
        ...(values.device ? { device: values.device } : {}),
      },
      {
        onSuccess: (result) => {
          const volume = candidates.find((v) => v.id === values.volume_id);
          notify.success(
            `Attaching volume ${volume?.name || values.volume_id} to ${instance.name}${result.device ? ` on ${result.device}` : ""}.`,
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
      title={`Attach volume to ${instance.name}`}
      submitLabel="Attach volume"
      onSubmit={submit}
      isPending={attach.isPending}
      error={attach.error ?? volumes.error}
    >
      <SelectInput
        control={form.control}
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
        control={form.control}
        name="device"
        label="Device name"
        description="Optional, such as /dev/vdc. The hypervisor may pick a different name."
      />
    </FormDialog>
  );
}
