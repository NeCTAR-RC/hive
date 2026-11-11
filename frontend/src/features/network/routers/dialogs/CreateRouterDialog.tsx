// Create a router (Horizon's routers/forms.py).
import { useQuery } from "@tanstack/react-query";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { OptionErrors } from "../../../../components/OptionErrors/OptionErrors";
import { fieldsFor } from "../../../../components/Form/fields";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { networkOptionsQuery, useCreateRouter } from "../../api";
import { FloatingNetworkSelect } from "./FloatingNetworkSelect";
import { createRouterRequest } from "./request";
import { createRouterSchema, type CreateRouterValues } from "./schema";

/**
 * The create router dialog: name, admin state, an optional external
 * network for its gateway and, where the cloud has them, zone hints.
 */
export function CreateRouterDialog({ onClose }: { onClose: () => void }) {
  const projectId = useProjectId();
  const options = useQuery(networkOptionsQuery(projectId));
  const { CheckboxesInput, SwitchInput, TextInput } =
    fieldsFor<CreateRouterValues>();
  const { dialog } = useMutationForm({
    schema: createRouterSchema,
    defaultValues: {
      name: "",
      admin_state_up: true,
      external_network_id: "",
      availability_zone_hints: [],
    },
    mutation: useCreateRouter(),
    toVariables: createRouterRequest,
    successMessage: (router) => `Router ${router.name} was created.`,
    onDone: onClose,
  });
  const zones = options.data?.availability_zones?.router ?? [];
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? options.error}
      title="Create router"
      submitLabel="Create router"
    >
      <OptionErrors errors={options.data?.errors} />
      <TextInput name="name" label="Router name" />
      <SwitchInput
        name="admin_state_up"
        label="Enable admin state (the router is up)"
      />
      <FloatingNetworkSelect
        options={options.data?.floating_networks ?? undefined}
      />
      {zones.length > 0 && (
        <CheckboxesInput
          name="availability_zone_hints"
          label="Availability zone hints"
          options={zones.map((z) => ({ id: z, label: z }))}
          description="Zones where the router may be scheduled. Leaving every box clear is the same as selecting them all."
        />
      )}
    </FormDialog>
  );
}
