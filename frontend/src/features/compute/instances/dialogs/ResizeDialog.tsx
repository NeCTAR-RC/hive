// The resize instance dialog.
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@ardc-ui/react";
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { formatMb, formatSuRate } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import {
  resizeFlavorsQuery,
  useInstanceAction,
  type InstanceActionVariables,
} from "../../api";
import type { InstanceDialogProps } from "./props";

const resizeSchema = z.object({
  flavor_id: z.string().min(1, "Choose a flavour"),
});

/**
 * Moves the instance to another flavour from those Nova offers it, naming
 * the current one and warning when the new one is preemptible. The resize
 * then waits for the user to confirm or revert it.
 */
export function ResizeDialog({ instance, onClose }: InstanceDialogProps) {
  const projectId = useProjectId();
  const flavors = useQuery(resizeFlavorsQuery(projectId, instance.id));
  const { SelectInput } = fieldsFor<z.infer<typeof resizeSchema>>();
  const { form, dialog } = useMutationForm({
    schema: resizeSchema,
    defaultValues: { flavor_id: "" },
    mutation: useInstanceAction(),
    toVariables: (values): InstanceActionVariables => ({
      instanceId: instance.id,
      body: { action: "resize", flavor_id: values.flavor_id },
    }),
    successMessage: `Resize of ${instance.name} started. Confirm it once the instance reports "verify resize".`,
    onDone: onClose,
  });
  const chosen = useWatch({ control: form.control, name: "flavor_id" });
  const flavor = flavors.data?.items.find((f) => f.id === chosen);
  const options = (flavors.data?.items ?? []).map((f) => ({
    id: f.id,
    label: `${f.name} (${f.vcpus ?? "?"} vCPU, ${formatMb(f.ram_mb)}${f.su_rate !== null ? `, ${formatSuRate(f.su_rate)}` : ""})`,
  }));
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? flavors.error}
      title={`Resize ${instance.name}`}
      submitLabel="Resize"
    >
      <p>
        Current flavour: <strong>{instance.flavor?.name ?? "unknown"}</strong>
        {instance.flavor?.su_rate !== null &&
        instance.flavor?.su_rate !== undefined
          ? ` (${formatSuRate(instance.flavor.su_rate)})`
          : ""}
        . The instance reboots as part of the resize.
      </p>
      <SelectInput
        name="flavor_id"
        label="New flavour"
        options={options}
        isRequired
        isDisabled={flavors.isPending}
        placeholder={
          flavors.isPending ? "Loading flavours..." : "Choose a flavour"
        }
      />
      {flavor?.is_preemptible && (
        <Alert tone="warning" role="status">
          Preemptible instances have a maximum lifetime of 24 hours and may be
          stopped at any time.
        </Alert>
      )}
    </FormDialog>
  );
}
