// The create load balancer wizard's optional health monitor step.
import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { fieldsFor } from "../../../../components/Form/fields";
import { isHttpMonitor } from "../../schemas";
import type { CreateForm, CreateStepProps } from "../createForm";
import styles from "../../LoadBalancers.module.scss";

const { NumberInput, SelectInput, SwitchInput, TextInput } =
  fieldsFor<CreateForm>();

/**
 * The pool's health monitor, when switched on, which turns the listener
 * and the pool on too. An HTTP monitor also asks for its method, path and
 * expected codes.
 */
export function MonitorStep({ data }: CreateStepProps) {
  const form = useFormContext<CreateForm>();
  const [enabled, type] = useWatch({
    control: form.control,
    name: ["create_monitor", "monitor.type"],
  });
  useEffect(() => {
    if (enabled) {
      form.setValue("create_listener", true);
      form.setValue("create_pool", true);
    }
  }, [enabled, form]);
  return (
    <div className={styles.fields}>
      <SwitchInput name="create_monitor" label="Create a health monitor now" />
      {enabled && (
        <>
          <SelectInput
            name="monitor.type"
            label="Type"
            options={data.monitor_types.map((t) => ({ id: t, label: t }))}
            isRequired
          />
          <NumberInput
            name="monitor.delay"
            label="Delay (seconds)"
            minValue={0}
            isRequired
          />
          <NumberInput
            name="monitor.timeout"
            label="Timeout (seconds)"
            minValue={0}
            isRequired
          />
          <NumberInput
            name="monitor.max_retries"
            label="Retries before marking up"
            minValue={1}
            maxValue={10}
            isRequired
          />
          <NumberInput
            name="monitor.max_retries_down"
            label="Retries before marking down"
            minValue={1}
            maxValue={10}
            isRequired
          />
          {isHttpMonitor(type) && (
            <>
              <SelectInput
                name="monitor.http_method"
                label="HTTP method"
                options={data.http_methods.map((m) => ({ id: m, label: m }))}
              />
              <TextInput name="monitor.url_path" label="URL path" />
              <TextInput
                name="monitor.expected_codes"
                label="Expected status codes"
                description="A code, a range (200-204) or a list (200,301)."
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
