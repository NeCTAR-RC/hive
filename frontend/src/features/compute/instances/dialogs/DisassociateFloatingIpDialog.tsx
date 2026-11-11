// The disassociate floating IP dialog of the instance menu.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { useDisassociateFloatingIp } from "../../../network/api";
import { instancePortsQuery } from "../../api";
import { portAddresses } from "../ports";
import type { InstanceDialogProps } from "./props";

const disassociateSchema = z.object({
  floating_ip_id: z.string().min(1, "Choose a floating IP"),
});

/**
 * Horizon's DisassociateIP from the instance menu: pick which of the
 * instance's floating IPs to detach (preselected when there is one).
 */
export function DisassociateFloatingIpDialog({
  instance,
  onClose,
}: InstanceDialogProps) {
  const projectId = useProjectId();
  const ports = useQuery(instancePortsQuery(projectId, instance.id));
  const floating = useMemo(
    () =>
      (ports.data?.items ?? []).flatMap((p) =>
        p.floating_ips.map((f) => ({
          id: f.id,
          address: f.address,
          label: `${f.address} on ${portAddresses(p) || p.id}`,
        })),
      ),
    [ports.data],
  );
  // The sole floating IP is preselected once the ports load; a choice the
  // user has already made survives later refetches.
  const preselected = useMemo(
    () => ({
      floating_ip_id: floating.length === 1 ? (floating[0]?.id ?? "") : "",
    }),
    [floating],
  );
  const { SelectInput } = fieldsFor<z.infer<typeof disassociateSchema>>();
  const { dialog } = useMutationForm({
    schema: disassociateSchema,
    values: preselected,
    mutation: useDisassociateFloatingIp(),
    toVariables: (values) => values.floating_ip_id,
    successMessage: (_ip, values) => {
      const chosen = floating.find((f) => f.id === values.floating_ip_id);
      return `Disassociated floating IP ${chosen?.address ?? ""} from ${instance.name}.`;
    },
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? ports.error}
      title={`Disassociate floating IP from ${instance.name}`}
      submitLabel="Disassociate"
      submitTone="danger"
    >
      <SelectInput
        name="floating_ip_id"
        label="Floating IP"
        options={floating}
        isRequired
        isDisabled={ports.isPending || floating.length === 0}
        placeholder={
          ports.isPending
            ? "Loading floating IPs..."
            : floating.length === 0
              ? "No floating IP is associated"
              : "Choose a floating IP"
        }
        description="The address stays allocated to the project."
      />
    </FormDialog>
  );
}
