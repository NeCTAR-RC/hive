// The create load balancer wizard's optional pool step.
import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { fieldsFor } from "../../../../components/Form/fields";
import { humanise } from "../../../../lib/status";
import { persistenceTypesFor, poolProtocolFor } from "../../status";
import type { CreateForm, CreateStepProps } from "../createForm";
import styles from "../../LoadBalancers.module.scss";

const { SelectInput, SwitchInput, TextInput } = fieldsFor<CreateForm>();

/**
 * The pool, when switched on; it takes the listener's protocol, so switching
 * it on turns the listener on, and switching it off turns the monitor off.
 * A UDP or SCTP listener's pool offers source IP persistence only.
 */
export function PoolStep({ data }: CreateStepProps) {
  const form = useFormContext<CreateForm>();
  const [enabled, persistence, listenerProtocol] = useWatch({
    control: form.control,
    name: ["create_pool", "pool.persistence", "listener.protocol"],
  });
  useEffect(() => {
    if (enabled) form.setValue("create_listener", true);
    else form.setValue("create_monitor", false);
  }, [enabled, form]);
  const protocol = poolProtocolFor(listenerProtocol);
  return (
    <div className={styles.fields}>
      <SwitchInput name="create_pool" label="Create a pool now" />
      {enabled && (
        <>
          <p className={styles.note}>
            The pool uses the listener&apos;s protocol: {protocol}.
          </p>
          <TextInput name="pool.name" label="Name" />
          <SelectInput
            name="pool.lb_algorithm"
            label="Algorithm"
            options={data.algorithms.map((a) => ({
              id: a,
              label: humanise(a),
            }))}
            isRequired
          />
          <SelectInput
            name="pool.persistence"
            label="Session persistence"
            options={[
              { id: "", label: "None" },
              ...persistenceTypesFor(protocol, data.persistence_types).map(
                (t) => ({ id: t, label: humanise(t) }),
              ),
            ]}
          />
          {persistence === "APP_COOKIE" && (
            <TextInput name="pool.cookie_name" label="Cookie name" isRequired />
          )}
        </>
      )}
    </div>
  );
}
