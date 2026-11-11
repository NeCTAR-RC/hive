// Add an interface on one of the project's subnets to a router (Horizon's
// routers/ports/forms.py).
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { fieldsFor } from "../../../../components/Form/fields";
import type { Router } from "../../../../lib/api/types/network";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { interfaceCandidatesQuery, useAddInterface } from "../../api";
import { addInterfaceRequest } from "./request";
import { interfaceSchema, type InterfaceValues } from "./schema";

/**
 * The add interface dialog: a subnet not on the router yet and an
 * optional address, which defaults to the subnet's gateway address.
 */
export function AddInterfaceDialog({
  router,
  onClose,
}: {
  router: Router;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const candidates = useQuery(interfaceCandidatesQuery(projectId, router.id));
  const { SelectInput, TextInput } = fieldsFor<InterfaceValues>();
  const { form, dialog } = useMutationForm({
    schema: interfaceSchema,
    defaultValues: { subnet_id: "", ip_address: "" },
    mutation: useAddInterface(),
    toVariables: (values) => addInterfaceRequest(router.id, values),
    successMessage: (result) =>
      `Interface added${result.ip_address ? ` with address ${result.ip_address}` : ""}.`,
    onDone: onClose,
  });
  const subnetId = useWatch({ control: form.control, name: "subnet_id" });
  const chosen = (candidates.data?.items ?? []).find((s) => s.id === subnetId);
  const items = candidates.data?.items ?? [];
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? candidates.error}
      title={`Add interface to ${router.name}`}
      submitLabel="Add interface"
    >
      <SelectInput
        name="subnet_id"
        label="Subnet"
        options={items.map((s) => ({
          id: s.id,
          label: `${s.network_name ? `${s.network_name}: ` : ""}${s.cidr} (${s.name || s.id})${s.overlaps ? `, overlaps ${s.overlaps} on this router` : ""}`,
          // Neutron refuses two overlapping subnets on one router.
          isDisabled: s.overlaps !== null,
        }))}
        isRequired
        isDisabled={candidates.isPending || items.length === 0}
        placeholder={
          candidates.isPending
            ? "Loading subnets..."
            : items.length === 0
              ? "No subnets available"
              : "Choose a subnet"
        }
        description="Subnets of your own networks that have a gateway and are not on this router yet. A subnet whose range overlaps one already on the router cannot be added."
      />
      <TextInput
        name="ip_address"
        label="IP address (optional)"
        description={
          chosen?.gateway_ip
            ? `Leave blank to use the subnet's gateway address ${chosen.gateway_ip}.`
            : "Leave blank to use the subnet's gateway address."
        }
      />
    </FormDialog>
  );
}
