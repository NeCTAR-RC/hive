// The dialog that adds a pool to a load balancer (octavia-dashboard
// workflow/pool).
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { LoadBalancerTree } from "../../../../lib/api/types/loadbalancers";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { humanise } from "../../../../lib/status";
import { loadBalancerOptionsQuery, useCreatePool } from "../../api";
import { persistenceTypesFor, usablePersistence } from "../../status";
import {
  createPoolBody,
  createPoolSchema,
  newPoolProtocol,
  type CreatePoolValues,
} from "./poolForm";
import styles from "../../LoadBalancers.module.scss";

const { SelectInput, SwitchInput, TextAreaInput, TextInput } =
  fieldsFor<CreatePoolValues>();

/**
 * Creates a pool on the load balancer in `tree`, as the default pool of a
 * listener that has none yet, or on its own with a protocol of its own.
 * A UDP or SCTP pool offers source IP persistence only, and a change of
 * listener or protocol drops a persistence type the pool cannot use.
 */
export function CreatePoolDialog({
  tree,
  onClose,
}: {
  tree: LoadBalancerTree;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const freeListeners = tree.listeners.filter((l) => !l.default_pool_id);
  const { form, dialog } = useMutationForm({
    schema: createPoolSchema,
    defaultValues: {
      name: "",
      description: "",
      listener_id: freeListeners[0]?.id ?? "",
      protocol: "",
      lb_algorithm: "ROUND_ROBIN",
      persistence: "",
      cookie_name: "",
      admin_state_up: true,
    },
    mutation: useCreatePool(),
    toVariables: (v) => createPoolBody(tree.load_balancer.id, v),
    successMessage: "A new pool is being created.",
    onDone: onClose,
  });
  const [listenerId, chosenProtocol, persistence] = useWatch({
    control: form.control,
    name: ["listener_id", "protocol", "persistence"],
  });
  const listener = tree.listeners.find((l) => l.id === listenerId);
  const protocol = newPoolProtocol(tree.listeners, listenerId, chosenProtocol);
  const allPersistenceTypes = options.data?.persistence_types ?? [];
  const dropUnusablePersistence = (protocol: string) =>
    form.setValue(
      "persistence",
      usablePersistence(
        protocol,
        form.getValues("persistence"),
        allPersistenceTypes,
      ),
      { shouldDirty: true },
    );
  return (
    <FormDialog
      {...dialog}
      title="Create pool"
      submitLabel="Create pool"
      size="lg"
    >
      <TextInput name="name" label="Name" />
      <TextAreaInput name="description" label="Description" />
      <SelectInput
        name="listener_id"
        label="Listener"
        description="The pool becomes the listener's default pool. Without a listener, choose the protocol."
        options={[
          { id: "", label: "No listener yet" },
          ...freeListeners.map((l) => ({
            id: l.id,
            label: `${l.name || l.id} (${l.protocol} ${l.protocol_port})`,
          })),
        ]}
        onValueChange={(id) =>
          dropUnusablePersistence(
            newPoolProtocol(tree.listeners, id, form.getValues("protocol")),
          )
        }
      />
      {listener ? (
        <p className={styles.note}>The pool uses {protocol}.</p>
      ) : (
        <SelectInput
          name="protocol"
          label="Protocol"
          options={(options.data?.pool_protocols ?? []).map((p) => ({
            id: p,
            label: p,
          }))}
          isRequired
          onValueChange={dropUnusablePersistence}
        />
      )}
      <SelectInput
        name="lb_algorithm"
        label="Algorithm"
        options={(
          options.data?.algorithms ?? [
            "ROUND_ROBIN",
            "LEAST_CONNECTIONS",
            "SOURCE_IP",
          ]
        ).map((a) => ({ id: a, label: humanise(a) }))}
        isRequired
      />
      <SelectInput
        name="persistence"
        label="Session persistence"
        options={[
          { id: "", label: "None" },
          ...persistenceTypesFor(protocol, allPersistenceTypes).map((t) => ({
            id: t,
            label: humanise(t),
          })),
        ]}
      />
      {persistence === "APP_COOKIE" && (
        <TextInput name="cookie_name" label="Cookie name" isRequired />
      )}
      <SwitchInput name="admin_state_up" label="Admin state up" />
    </FormDialog>
  );
}
