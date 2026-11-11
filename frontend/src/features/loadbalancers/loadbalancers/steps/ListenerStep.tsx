// The create load balancer wizard's optional listener step.
import { useEffect } from "react";
import { useFormContext, useWatch, type UseFormReturn } from "react-hook-form";
import { fieldsFor } from "../../../../components/Form/fields";
import { hasTimeouts } from "../../bodies";
import { ListenerTimeoutFields } from "../../listeners/ListenerTimeoutFields";
import { listenerProtocols, TLS_REF_HELP } from "../../status";
import {
  protocolLinks,
  type CreateForm,
  type CreateStepProps,
} from "../createForm";
import styles from "../../LoadBalancers.module.scss";

const { NumberInput, SelectInput, SwitchInput, TextAreaInput, TextInput } =
  fieldsFor<CreateForm>();

/**
 * Moves what follows the listener protocol (`protocolLinks`): the listener
 * port, every member's port and a persistence type the new pool cannot
 * use. It runs on a protocol change only, so a port the user set survives
 * leaving and coming back to the step.
 */
function changeProtocol(
  form: UseFormReturn<CreateForm>,
  protocol: string,
  persistenceTypes: readonly string[],
) {
  const links = protocolLinks(
    protocol,
    form.getValues("pool.persistence"),
    persistenceTypes,
  );
  const dirty = { shouldDirty: true };
  form.setValue("listener.protocol_port", links.listenerPort ?? null, dirty);
  form
    .getValues("members")
    .forEach((_, index) =>
      form.setValue(
        `members.${index}.protocol_port`,
        links.memberPort ?? null,
        dirty,
      ),
    );
  form.setValue("pool.persistence", links.persistence, dirty);
}

/**
 * The listener, when switched on; switching it off also turns off the pool
 * and the monitor, which need it. The fields follow the protocol: the
 * certificate for terminated HTTPS, the forwarded headers for HTTP and
 * terminated HTTPS, and the timeouts for all but UDP and SCTP.
 */
export function ListenerStep({ data }: CreateStepProps) {
  const form = useFormContext<CreateForm>();
  const [enabled, protocol] = useWatch({
    control: form.control,
    name: ["create_listener", "listener.protocol"],
  });
  useEffect(() => {
    if (!enabled) {
      form.setValue("create_pool", false);
      form.setValue("create_monitor", false);
    }
  }, [enabled, form]);
  return (
    <div className={styles.fields}>
      <SwitchInput name="create_listener" label="Create a listener now" />
      {enabled && (
        <>
          <TextInput name="listener.name" label="Name" />
          <SelectInput
            name="listener.protocol"
            label="Protocol"
            options={listenerProtocols(data).map((p) => ({ id: p, label: p }))}
            isRequired
            onValueChange={(value) =>
              changeProtocol(form, value, data.persistence_types)
            }
          />
          <NumberInput
            name="listener.protocol_port"
            label="Port"
            minValue={1}
            maxValue={65535}
            isRequired
          />
          {protocol === "TERMINATED_HTTPS" && (
            <TextInput
              name="listener.tls_ref"
              label="TLS certificate reference"
              description={TLS_REF_HELP}
              isRequired
            />
          )}
          {["HTTP", "TERMINATED_HTTPS"].includes(protocol) && (
            <>
              <SwitchInput
                name="listener.xff"
                label="Insert X-Forwarded-For header"
              />
              <SwitchInput
                name="listener.xfp"
                label="Insert X-Forwarded-Port header"
              />
              <SwitchInput
                name="listener.xfproto"
                label="Insert X-Forwarded-Proto header"
              />
            </>
          )}
          <NumberInput
            name="listener.connection_limit"
            label="Connection limit"
            description="-1 for no limit."
            minValue={-1}
          />
          <TextAreaInput
            name="listener.allowed_cidrs"
            label="Allowed CIDRs"
            description="One CIDR per line; leave empty to allow all sources."
          />
          {hasTimeouts(protocol) && (
            <ListenerTimeoutFields prefix="listener." />
          )}
        </>
      )}
    </div>
  );
}
