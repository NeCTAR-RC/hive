// The detach interface dialog.
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import {
  instancePortsQuery,
  useInstanceAction,
  type InstanceActionVariables,
} from "../../api";
import { portAddresses } from "../ports";
import type { InstanceDialogProps } from "./props";

const detachSchema = z.object({ port_id: z.string().min(1, "Choose a port") });

/**
 * Detaches one of the instance's interfaces, each named by its fixed
 * addresses and any floating IPs on it.
 */
export function DetachInterfaceDialog({
  instance,
  onClose,
}: InstanceDialogProps) {
  const projectId = useProjectId();
  const ports = useQuery(instancePortsQuery(projectId, instance.id));
  const { SelectInput } = fieldsFor<z.infer<typeof detachSchema>>();
  const { dialog } = useMutationForm({
    schema: detachSchema,
    defaultValues: { port_id: "" },
    mutation: useInstanceAction(),
    toVariables: (values): InstanceActionVariables => ({
      instanceId: instance.id,
      body: { action: "detach-interface", port_id: values.port_id },
    }),
    successMessage: `Interface detached from ${instance.name}.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? ports.error}
      title={`Detach interface from ${instance.name}`}
      submitLabel="Detach interface"
      submitTone="danger"
    >
      <SelectInput
        name="port_id"
        label="Interface"
        options={(ports.data?.items ?? []).map((p) => ({
          id: p.id,
          label: `${portAddresses(p) || p.id}${p.floating_ips.length ? ` (floating ${p.floating_ips.map((f) => f.address).join(", ")})` : ""}`,
        }))}
        isRequired
        isDisabled={ports.isPending}
        placeholder={
          ports.isPending ? "Loading interfaces..." : "Choose an interface"
        }
      />
    </FormDialog>
  );
}
