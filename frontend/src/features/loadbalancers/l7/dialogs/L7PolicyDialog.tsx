// The dialog that creates or edits a listener's L7 policy
// (octavia-dashboard workflow/l7policy).
import { useMutation, useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type {
  L7Policy,
  L7PolicySpec,
  LoadBalancerTree,
} from "../../../../lib/api/types/loadbalancers";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { humanise } from "../../../../lib/status";
import {
  loadBalancerOptionsQuery,
  useCreateL7Policy,
  useUpdateL7Policy,
} from "../../api";
import { poolProtocolFor } from "../../status";
import { policyBody, policySchema, type PolicyValues } from "./policyForm";

const { NumberInput, SelectInput, SwitchInput, TextAreaInput, TextInput } =
  fieldsFor<PolicyValues>();

/**
 * Creates a policy on the listener, or edits `policy` when one is given. A
 * redirect to a pool offers the load balancer's pools that speak the
 * listener's protocol.
 */
export function L7PolicyDialog({
  tree,
  listenerId,
  policy,
  onClose,
}: {
  tree: LoadBalancerTree;
  listenerId: string;
  policy: L7Policy | null;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const create = useCreateL7Policy();
  const update = useUpdateL7Policy();
  const listener = tree.listeners.find((l) => l.id === listenerId);
  const pools = tree.pools.filter(
    (p) => !listener || p.protocol === poolProtocolFor(listener.protocol),
  );
  // Creates or updates, as one save, so the dialog has one pending state
  // and one error.
  const save = useMutation({
    mutationFn: (body: L7PolicySpec) =>
      policy
        ? update.mutateAsync({ id: policy.id, ...body })
        : create.mutateAsync({ listener_id: listenerId, ...body }),
  });
  const { form, dialog } = useMutationForm({
    schema: policySchema,
    defaultValues: {
      name: policy?.name ?? "",
      description: policy?.description ?? "",
      action: policy?.action ?? "REJECT",
      redirect_url: policy?.redirect_url ?? "",
      redirect_pool_id: policy?.redirect_pool_id ?? "",
      redirect_prefix: policy?.redirect_prefix ?? "",
      ...(policy?.position ? { position: policy.position } : {}),
      admin_state_up: policy?.admin_state_up ?? true,
    },
    mutation: save,
    toVariables: policyBody,
    successMessage: policy
      ? "The policy has been updated."
      : "A new L7 policy is being created.",
    onDone: onClose,
  });
  const action = useWatch({ control: form.control, name: "action" });
  return (
    <FormDialog
      {...dialog}
      title={
        policy ? `Edit policy ${policy.name || policy.id}` : "Create L7 policy"
      }
      submitLabel={policy ? "Save" : "Create policy"}
    >
      <TextInput name="name" label="Name" />
      <TextAreaInput name="description" label="Description" />
      <SelectInput
        name="action"
        label="Action"
        options={(
          options.data?.l7_actions ?? [
            "REJECT",
            "REDIRECT_TO_URL",
            "REDIRECT_TO_POOL",
            "REDIRECT_PREFIX",
          ]
        ).map((a) => ({ id: a, label: humanise(a) }))}
        isRequired
      />
      {action === "REDIRECT_TO_URL" && (
        <TextInput
          name="redirect_url"
          label="Redirect URL"
          type="url"
          isRequired
        />
      )}
      {action === "REDIRECT_PREFIX" && (
        <TextInput
          name="redirect_prefix"
          label="Redirect prefix"
          type="url"
          isRequired
        />
      )}
      {action === "REDIRECT_TO_POOL" && (
        <SelectInput
          name="redirect_pool_id"
          label="Redirect to pool"
          options={pools.map((p) => ({ id: p.id, label: p.name || p.id }))}
          isRequired
        />
      )}
      <NumberInput
        name="position"
        label="Position"
        description="Policies are evaluated in position order."
        minValue={1}
      />
      <SwitchInput name="admin_state_up" label="Admin state up" />
    </FormDialog>
  );
}
