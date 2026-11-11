// Set a router's gateway to an external network.
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { Router } from "../../../../lib/api/types/network";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { networkOptionsQuery, useSetGateway } from "../../api";
import { FloatingNetworkSelect } from "./FloatingNetworkSelect";

const gatewaySchema = z.object({
  external_network_id: z.string().min(1, "Choose an external network"),
});

/** The set gateway dialog: one required external network. */
export function SetGatewayDialog({
  router,
  onClose,
}: {
  router: Router;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(networkOptionsQuery(projectId));
  const { dialog } = useMutationForm({
    schema: gatewaySchema,
    defaultValues: { external_network_id: "" },
    mutation: useSetGateway(),
    toVariables: (values) => ({
      routerId: router.id,
      networkId: values.external_network_id,
    }),
    successMessage: `Gateway set on router ${router.name}.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? options.error}
      title={`Set gateway on ${router.name}`}
      submitLabel="Set gateway"
    >
      <FloatingNetworkSelect
        options={options.data?.floating_networks ?? undefined}
        isRequired
      />
    </FormDialog>
  );
}
