// The dialog that edits a listener (octavia-dashboard workflow/listener).
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type {
  Listener,
  LoadBalancerTree,
} from "../../../../lib/api/types/loadbalancers";
import { useUpdateListener } from "../../api";
import { hasTimeouts } from "../../bodies";
import { LISTENER_TIMEOUT_DEFAULTS, TLS_REF_HELP } from "../../status";
import { ListenerTimeoutFields } from "../ListenerTimeoutFields";
import {
  editListenerBody,
  editListenerSchema,
  poolsFor,
  type EditListenerValues,
} from "./listenerForm";

const { NumberInput, SelectInput, SwitchInput, TextAreaInput, TextInput } =
  fieldsFor<EditListenerValues>();

/**
 * Edits `listener`. Its protocol and port are fixed, so the forwarded
 * headers, timeouts and TLS settings show only where the protocol has them.
 */
export function EditListenerDialog({
  tree,
  listener,
  onClose,
}: {
  tree: LoadBalancerTree;
  listener: Listener;
  onClose: () => void;
}) {
  const { dialog } = useMutationForm({
    schema: editListenerSchema,
    defaultValues: {
      name: listener.name ?? "",
      description: listener.description ?? "",
      connection_limit: listener.connection_limit ?? -1,
      allowed_cidrs: listener.allowed_cidrs.join("\n"),
      xff: listener.insert_headers["X-Forwarded-For"] === "true",
      xfp: listener.insert_headers["X-Forwarded-Port"] === "true",
      xfproto: listener.insert_headers["X-Forwarded-Proto"] === "true",
      timeout_client_data:
        listener.timeout_client_data ??
        LISTENER_TIMEOUT_DEFAULTS.timeout_client_data,
      timeout_member_connect:
        listener.timeout_member_connect ??
        LISTENER_TIMEOUT_DEFAULTS.timeout_member_connect,
      timeout_member_data:
        listener.timeout_member_data ??
        LISTENER_TIMEOUT_DEFAULTS.timeout_member_data,
      timeout_tcp_inspect:
        listener.timeout_tcp_inspect ??
        LISTENER_TIMEOUT_DEFAULTS.timeout_tcp_inspect,
      tls_ref: listener.default_tls_container_ref ?? "",
      sni_refs: listener.sni_container_refs.join("\n"),
      tls_ciphers: listener.tls_ciphers ?? "",
      default_pool_id: listener.default_pool_id ?? "",
      admin_state_up: listener.admin_state_up ?? true,
    },
    mutation: useUpdateListener(),
    toVariables: (v) => ({
      id: listener.id,
      ...editListenerBody(listener.protocol, v),
    }),
    successMessage: "The listener has been updated.",
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Edit listener ${listener.name || listener.id}`}
      submitLabel="Save"
      size="lg"
    >
      <p>
        {listener.protocol} on port {listener.protocol_port}. The protocol and
        port cannot be changed.
      </p>
      <TextInput name="name" label="Name" />
      <TextAreaInput name="description" label="Description" />
      {["HTTP", "TERMINATED_HTTPS"].includes(listener.protocol) && (
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
          ...poolsFor(tree, listener.protocol).map((p) => ({
            id: p.id,
            label: p.name || p.id,
          })),
        ]}
      />
      <NumberInput
        name="connection_limit"
        label="Connection limit"
        minValue={-1}
      />
      <TextAreaInput name="allowed_cidrs" label="Allowed CIDRs" />
      {listener.protocol === "TERMINATED_HTTPS" && (
        <>
          <TextInput
            name="tls_ref"
            label="TLS certificate reference"
            description={TLS_REF_HELP}
          />
          <TextAreaInput
            name="sni_refs"
            label="SNI certificate references"
            description="Barbican references of further certificates, one per line, chosen by the server name the client asks for."
          />
          <TextInput
            name="tls_ciphers"
            label="TLS ciphers"
            description="An OpenSSL cipher string; leave empty for the Octavia default."
          />
        </>
      )}
      {hasTimeouts(listener.protocol) && <ListenerTimeoutFields prefix="" />}
      <SwitchInput name="admin_state_up" label="Admin state up" />
    </FormDialog>
  );
}
