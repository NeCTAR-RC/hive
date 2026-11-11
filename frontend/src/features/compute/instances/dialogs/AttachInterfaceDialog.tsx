// The attach interface dialog.
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { attachablePortsQuery, networksQuery } from "../../../network/api";
import { useInstanceAction } from "../../api";
import { attachablePortLabel } from "../ports";
import type { InstanceDialogProps } from "./props";
import { attachInterfaceBody } from "./requests";

const attachSchema = z
  .object({
    mode: z.enum(["network", "port"]),
    network_id: z.string(),
    port_id: z.string(),
  })
  .refine(
    (v) =>
      v.mode === "network" ? v.network_id.length > 0 : v.port_id.length > 0,
    {
      message: "Choose a network or a port",
      path: ["network_id"],
    },
  );

/**
 * Attaches a new interface to the instance: on a network, where Nova
 * creates the port, or by an existing port of the project.
 */
export function AttachInterfaceDialog({
  instance,
  onClose,
}: InstanceDialogProps) {
  const projectId = useProjectId();
  const networks = useQuery(networksQuery(projectId, "boot"));
  const ports = useQuery(attachablePortsQuery(projectId));
  const { RadioInput, SelectInput } = fieldsFor<z.infer<typeof attachSchema>>();
  const { form, dialog } = useMutationForm({
    schema: attachSchema,
    defaultValues: { mode: "network", network_id: "", port_id: "" },
    mutation: useInstanceAction(),
    toVariables: (values) => ({
      instanceId: instance.id,
      body: attachInterfaceBody(values),
    }),
    successMessage: `Interface attached to ${instance.name}.`,
    onDone: onClose,
  });
  const mode = useWatch({ control: form.control, name: "mode" });
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? networks.error ?? ports.error}
      title={`Attach interface to ${instance.name}`}
      submitLabel="Attach interface"
    >
      <RadioInput
        name="mode"
        label="Attach by"
        options={[
          { id: "network", label: "Network (a new port is created)" },
          { id: "port", label: "Existing port" },
        ]}
      />
      {mode === "network" ? (
        <SelectInput
          name="network_id"
          label="Network"
          options={(networks.data?.items ?? []).map((n) => ({
            id: n.id,
            label: n.name,
          }))}
          isRequired
          isDisabled={networks.isPending}
          placeholder={
            networks.isPending ? "Loading networks..." : "Choose a network"
          }
        />
      ) : (
        <SelectInput
          name="port_id"
          label="Port"
          options={(ports.data?.items ?? []).map((p) => ({
            id: p.id,
            label: attachablePortLabel(p),
          }))}
          isRequired
          isDisabled={ports.isPending}
          placeholder={ports.isPending ? "Loading ports..." : "Choose a port"}
        />
      )}
    </FormDialog>
  );
}
