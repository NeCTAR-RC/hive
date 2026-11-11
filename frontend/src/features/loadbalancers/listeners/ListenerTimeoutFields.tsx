// A listener's four timeouts, as the create wizard and the create and edit
// listener dialogs ask for them (octavia-dashboard listener step, believed:
// the plugin is not checked out here).
import { Accordion, AccordionItem } from "@ardc-ui/react";
import { fieldsFor } from "../../../components/Form/fields";
import type { ListenerTimeouts } from "../bodies";
import styles from "../LoadBalancers.module.scss";

/** The forms the fields bind into: the timeouts at the top, or under `listener`. */
type TimeoutForm = ListenerTimeouts & { listener: ListenerTimeouts };

const { NumberInput } = fieldsFor<TimeoutForm>();

/**
 * The timeouts in milliseconds, collapsed until asked for, since the
 * defaults suit most listeners. `prefix` is where the form keeps them: ""
 * in the listener dialogs, "listener." in the wizard. The section title is
 * an h3, under the step's or the dialog's own heading. UDP and SCTP
 * listeners have no timeouts, so the caller leaves the fields out for them.
 */
export function ListenerTimeoutFields({
  prefix,
}: {
  prefix: "" | "listener.";
}) {
  return (
    <Accordion>
      <AccordionItem id="timeouts" title="Timeouts (milliseconds)">
        <div className={styles.fields}>
          <NumberInput
            name={`${prefix}timeout_client_data`}
            label="Client data timeout"
            minValue={0}
          />
          <NumberInput
            name={`${prefix}timeout_member_connect`}
            label="Member connect timeout"
            minValue={0}
          />
          <NumberInput
            name={`${prefix}timeout_member_data`}
            label="Member data timeout"
            minValue={0}
          />
          <NumberInput
            name={`${prefix}timeout_tcp_inspect`}
            label="TCP inspect timeout"
            minValue={0}
          />
        </div>
      </AccordionItem>
    </Accordion>
  );
}
