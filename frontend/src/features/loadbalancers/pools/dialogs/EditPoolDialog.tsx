// The dialog that edits a pool (octavia-dashboard workflow/pool).
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { Pool } from "../../../../lib/api/types/loadbalancers";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { humanise } from "../../../../lib/status";
import { loadBalancerOptionsQuery, useUpdatePool } from "../../api";
import { persistenceTypesFor } from "../../status";
import { editPoolBody, editPoolSchema, type EditPoolValues } from "./poolForm";

const { SelectInput, SwitchInput, TextAreaInput, TextInput } =
  fieldsFor<EditPoolValues>();

/**
 * Edits `pool`: its name, algorithm, session persistence (source IP only
 * on a UDP or SCTP pool), TLS to the members and admin state.
 */
export function EditPoolDialog({
  pool,
  onClose,
}: {
  pool: Pool;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const { form, dialog } = useMutationForm({
    schema: editPoolSchema,
    defaultValues: {
      name: pool.name ?? "",
      description: pool.description ?? "",
      lb_algorithm: pool.lb_algorithm ?? "ROUND_ROBIN",
      persistence: pool.session_persistence?.type ?? "",
      cookie_name: pool.session_persistence?.cookie_name ?? "",
      tls_enabled: pool.tls_enabled ?? false,
      admin_state_up: pool.admin_state_up ?? true,
    },
    mutation: useUpdatePool(),
    toVariables: (v) => ({ id: pool.id, ...editPoolBody(v) }),
    successMessage: "The pool has been updated.",
    onDone: onClose,
  });
  const persistence = useWatch({ control: form.control, name: "persistence" });
  return (
    <FormDialog
      {...dialog}
      title={`Edit pool ${pool.name || pool.id}`}
      submitLabel="Save"
    >
      <TextInput name="name" label="Name" />
      <TextAreaInput name="description" label="Description" />
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
          ...persistenceTypesFor(
            pool.protocol,
            options.data?.persistence_types ?? [],
          ).map((t) => ({ id: t, label: humanise(t) })),
        ]}
      />
      {persistence === "APP_COOKIE" && (
        <TextInput name="cookie_name" label="Cookie name" isRequired />
      )}
      <SwitchInput
        name="tls_enabled"
        label="Re-encrypt traffic to the members with TLS"
      />
      <SwitchInput name="admin_state_up" label="Admin state up" />
    </FormDialog>
  );
}
