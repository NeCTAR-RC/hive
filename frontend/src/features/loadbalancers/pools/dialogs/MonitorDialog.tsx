// The dialog that creates or edits a pool's health monitor
// (octavia-dashboard monitor step).
import { useMutation, useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { offered } from "../../../../lib/api/offered";
import type {
  HealthMonitor,
  MonitorSpec,
  Pool,
} from "../../../../lib/api/types/loadbalancers";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import {
  loadBalancerOptionsQuery,
  useCreateMonitor,
  useUpdateMonitor,
} from "../../api";
import { isHttpMonitor } from "../../schemas";
import { monitorBody, monitorSchema, type MonitorValues } from "./monitorForm";

const { NumberInput, SelectInput, SwitchInput, TextInput } =
  fieldsFor<MonitorValues>();

/**
 * Creates a health monitor on `pool`, or edits `monitor` when the pool has
 * one; an HTTP monitor also asks for its method, path and expected codes.
 */
export function MonitorDialog({
  pool,
  monitor,
  onClose,
}: {
  pool: Pool;
  monitor: HealthMonitor | null;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const create = useCreateMonitor();
  const update = useUpdateMonitor();
  // Creates or updates, as one save, so the dialog has one pending state
  // and one error. The type is fixed once the monitor exists, so only a
  // create sends it.
  const save = useMutation({
    mutationFn: ({
      type,
      body,
    }: {
      type: MonitorSpec["type"];
      body: Omit<MonitorSpec, "type">;
    }) =>
      monitor
        ? update.mutateAsync({ id: monitor.id, ...body })
        : create.mutateAsync({ pool_id: pool.id, type, ...body }),
  });
  const { form, dialog } = useMutationForm({
    schema: monitorSchema,
    defaultValues: {
      name: monitor?.name ?? "",
      type: monitor?.type ?? "HTTP",
      delay: monitor?.delay ?? 5,
      timeout: monitor?.timeout ?? 5,
      max_retries: monitor?.max_retries ?? 3,
      max_retries_down: monitor?.max_retries_down ?? 3,
      http_method: monitor?.http_method ?? "GET",
      url_path: monitor?.url_path ?? "/",
      expected_codes: monitor?.expected_codes ?? "200",
      admin_state_up: monitor?.admin_state_up ?? true,
    },
    mutation: save,
    toVariables: (v) => ({
      type: offered<MonitorSpec["type"]>(v.type),
      body: monitorBody(v),
    }),
    successMessage: monitor
      ? "The health monitor has been updated."
      : "A new health monitor is being created.",
    onDone: onClose,
  });
  const type = useWatch({ control: form.control, name: "type" });
  const http = isHttpMonitor(type);
  return (
    <FormDialog
      {...dialog}
      title={monitor ? "Edit health monitor" : "Create health monitor"}
      submitLabel={monitor ? "Save" : "Create health monitor"}
    >
      <TextInput name="name" label="Name" />
      <SelectInput
        name="type"
        label="Type"
        options={(
          options.data?.monitor_types ?? [
            "HTTP",
            "HTTPS",
            "PING",
            "TCP",
            "TLS-HELLO",
            "UDP-CONNECT",
            "SCTP",
          ]
        ).map((t) => ({ id: t, label: t }))}
        isRequired
        isDisabled={monitor !== null}
      />
      <NumberInput
        name="delay"
        label="Delay (seconds)"
        minValue={0}
        isRequired
      />
      <NumberInput
        name="timeout"
        label="Timeout (seconds)"
        minValue={0}
        isRequired
      />
      <NumberInput
        name="max_retries"
        label="Retries before marking up"
        minValue={1}
        maxValue={10}
        isRequired
      />
      <NumberInput
        name="max_retries_down"
        label="Retries before marking down"
        minValue={1}
        maxValue={10}
        isRequired
      />
      {http && (
        <>
          <SelectInput
            name="http_method"
            label="HTTP method"
            options={(options.data?.http_methods ?? ["GET"]).map((m) => ({
              id: m,
              label: m,
            }))}
          />
          <TextInput name="url_path" label="URL path" />
          <TextInput name="expected_codes" label="Expected status codes" />
        </>
      )}
      <SwitchInput name="admin_state_up" label="Admin state up" />
    </FormDialog>
  );
}
