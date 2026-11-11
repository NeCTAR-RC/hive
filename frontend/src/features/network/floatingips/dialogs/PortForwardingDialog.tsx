// Add or edit a port forwarding rule on a floating IP (Horizon's
// floating_ip_portforwardings).
import { useMutation, useQuery } from "@tanstack/react-query";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { fieldsFor } from "../../../../components/Form/fields";
import type {
  FloatingIp,
  PortForwarding,
  PortForwardingRequest,
} from "../../../../lib/api/types/network";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import {
  floatingIpTargetsQuery,
  useCreatePortForwarding,
  useUpdatePortForwarding,
} from "../../api";
import { portForwardingRequest } from "./request";
import { portForwardingSchema, type PortForwardingValues } from "./schema";

/**
 * The port forwarding rule dialog: adds a rule to `floatingIp`, or edits
 * `rule` when one is given. A rule binds an external port (or range) to a
 * port on an internal address.
 */
export function PortForwardingDialog({
  floatingIp,
  rule,
  onClose,
}: {
  floatingIp: Pick<FloatingIp, "id" | "floating_ip_address">;
  /** Present when editing. */
  rule?: PortForwarding | undefined;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const targets = useQuery(floatingIpTargetsQuery(projectId));
  const create = useCreatePortForwarding();
  const update = useUpdatePortForwarding();
  // Adding and editing share one form: one save that sends the rule to
  // whichever endpoint fits, so the dialog has one pending state and error.
  const save = useMutation({
    mutationFn: (body: PortForwardingRequest) =>
      rule
        ? update.mutateAsync({
            floatingIpId: floatingIp.id,
            ruleId: rule.id,
            ...body,
          })
        : create.mutateAsync({ floatingIpId: floatingIp.id, ...body }),
  });
  const items = targets.data?.items ?? [];
  const { SelectInput, TextAreaInput, TextInput } =
    fieldsFor<PortForwardingValues>();
  const { dialog } = useMutationForm({
    schema: portForwardingSchema,
    defaultValues: {
      protocol: rule?.protocol === "udp" ? "udp" : "tcp",
      target_id: rule
        ? `${rule.internal_port_id}_${rule.internal_ip_address}`
        : "",
      internal_port: rule?.internal_port ?? "",
      external_port: rule?.external_port ?? "",
      description: rule?.description ?? "",
    },
    mutation: save,
    // The options are `items`, so the lookup only misses if the address
    // vanished in a refetch.
    toVariables: (values) => {
      const target = items.find((t) => t.id === values.target_id);
      if (!target) return null;
      return portForwardingRequest(values, target);
    },
    successMessage: (_rule, values) =>
      `${rule ? "Updated" : "Added"} the ${values.protocol.toUpperCase()} rule for port ${values.external_port} on ${floatingIp.floating_ip_address}. It can take a few minutes to apply.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? targets.error}
      title={
        rule
          ? `Edit port forwarding rule on ${floatingIp.floating_ip_address}`
          : `Add port forwarding rule on ${floatingIp.floating_ip_address}`
      }
      submitLabel={rule ? "Save" : "Add rule"}
    >
      <SelectInput
        name="protocol"
        label="Protocol"
        options={[
          { id: "tcp", label: "TCP" },
          { id: "udp", label: "UDP" },
        ]}
        isRequired
      />
      <TextInput
        name="external_port"
        label="External port"
        isRequired
        description="The port on the floating IP, or a range such as 2200:2210."
      />
      <SelectInput
        name="target_id"
        label="Internal IP address"
        options={items.map((t) => ({ id: t.id, label: t.name }))}
        isRequired
        isDisabled={targets.isPending || items.length === 0}
        placeholder={
          targets.isPending
            ? "Loading addresses..."
            : items.length === 0
              ? "No reachable addresses"
              : "Choose an address"
        }
      />
      <TextInput
        name="internal_port"
        label="Internal port"
        isRequired
        description="The port on the internal address. For an external range, either one port (the whole range goes to it) or a range of the same length."
      />
      <TextAreaInput name="description" label="Description" />
    </FormDialog>
  );
}
