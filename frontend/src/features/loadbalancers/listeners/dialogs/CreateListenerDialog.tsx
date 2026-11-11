// The dialog that adds a listener to a load balancer (octavia-dashboard
// workflow/listener).
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { LoadBalancerTree } from "../../../../lib/api/types/loadbalancers";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { loadBalancerOptionsQuery, useCreateListener } from "../../api";
import { hasTimeouts } from "../../bodies";
import {
  defaultPort,
  LISTENER_TIMEOUT_DEFAULTS,
  listenerProtocols,
  TLS_REF_HELP,
} from "../../status";
import { ListenerTimeoutFields } from "../ListenerTimeoutFields";
import {
  createListenerBody,
  createListenerSchema,
  poolsFor,
  type CreateListenerValues,
} from "./listenerForm";

const { NumberInput, SelectInput, SwitchInput, TextAreaInput, TextInput } =
  fieldsFor<CreateListenerValues>();

/**
 * Creates a listener on the load balancer in `tree`. A protocol change
 * moves the port to the protocol's first free default (empty for one
 * without a default) and clears the default pool, whose choices follow the
 * protocol. Terminated HTTPS is offered only where Barbican runs.
 */
export function CreateListenerDialog({
  tree,
  onClose,
}: {
  tree: LoadBalancerTree;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const used = tree.listeners.map((l) => l.protocol_port);
  const { form, dialog } = useMutationForm({
    schema: createListenerSchema,
    defaultValues: {
      name: "",
      description: "",
      protocol: "HTTP",
      protocol_port: defaultPort("HTTP", used) ?? null,
      connection_limit: -1,
      allowed_cidrs: "",
      xff: false,
      xfp: false,
      xfproto: false,
      tls_ref: "",
      ...LISTENER_TIMEOUT_DEFAULTS,
      default_pool_id: "",
      admin_state_up: true,
    },
    mutation: useCreateListener(),
    toVariables: (v) => createListenerBody(tree.load_balancer.id, v),
    successMessage: "A new listener is being created.",
    onDone: onClose,
  });
  const protocol = useWatch({ control: form.control, name: "protocol" });
  const changeProtocol = (next: string) => {
    const dirty = { shouldDirty: true };
    form.setValue("protocol_port", defaultPort(next, used) ?? null, dirty);
    form.setValue("default_pool_id", "", dirty);
  };
  return (
    <FormDialog
      {...dialog}
      title="Create listener"
      submitLabel="Create listener"
      size="lg"
    >
      <TextInput name="name" label="Name" />
      <TextAreaInput name="description" label="Description" />
      <SelectInput
        name="protocol"
        label="Protocol"
        options={listenerProtocols(options.data).map((p) => ({
          id: p,
          label: p,
        }))}
        isRequired
        onValueChange={changeProtocol}
      />
      <NumberInput
        name="protocol_port"
        label="Port"
        minValue={1}
        maxValue={65535}
        isRequired
      />
      {protocol === "TERMINATED_HTTPS" && (
        <TextInput
          name="tls_ref"
          label="TLS certificate reference"
          description={TLS_REF_HELP}
          isRequired
        />
      )}
      {["HTTP", "TERMINATED_HTTPS"].includes(protocol) && (
        <>
          <SwitchInput name="xff" label="Insert X-Forwarded-For header" />
          <SwitchInput name="xfp" label="Insert X-Forwarded-Port header" />
          <SwitchInput name="xfproto" label="Insert X-Forwarded-Proto header" />
        </>
      )}
      <SelectInput
        name="default_pool_id"
        label="Default pool"
        options={[
          { id: "", label: "None" },
          ...poolsFor(tree, protocol).map((p) => ({
            id: p.id,
            label: p.name || p.id,
          })),
        ]}
      />
      <NumberInput
        name="connection_limit"
        label="Connection limit"
        description="-1 for no limit."
        minValue={-1}
      />
      <TextAreaInput
        name="allowed_cidrs"
        label="Allowed CIDRs"
        description="One per line; empty allows all sources."
      />
      {hasTimeouts(protocol) && <ListenerTimeoutFields prefix="" />}
      <SwitchInput name="admin_state_up" label="Admin state up" />
    </FormDialog>
  );
}
