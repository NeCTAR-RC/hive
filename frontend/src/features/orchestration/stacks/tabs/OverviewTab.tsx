// The overview tab of a stack: status, launch parameters, outputs and the
// stack parameters.
import { Alert } from "@ardc-ui/react";
import { KeyValueList } from "../../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../../components/Panel/Panel";
import { StatusPill } from "../../../../components/StatusPill/StatusPill";
import type { StackDetail } from "../../../../lib/api/types/orchestration";
import { formatDateTime, formatWithUnit } from "../../../../lib/format";
import { statusLabel, statusTone } from "../../status";
import styles from "../../Orchestration.module.scss";

/**
 * A stack's status, settings, outputs and parameters, with the failure
 * reason on top when the last operation failed. Heat's own `OS::`
 * parameters are left out.
 */
export function OverviewTab({ stack }: { stack: StackDetail }) {
  const parameters = Object.entries(stack.parameters).filter(
    ([key]) => !key.startsWith("OS::"),
  );
  return (
    <div className={styles.stack}>
      {stack.status_reason && stack.status?.endsWith("_FAILED") && (
        <Alert tone="danger" role="status">
          {stack.status_reason}
        </Alert>
      )}
      <div className={styles.grid}>
        <Panel title="Status">
          <KeyValueList
            items={[
              {
                label: "Status",
                value: (
                  <StatusPill tone={statusTone(stack.status)}>
                    {statusLabel(stack.status)}
                  </StatusPill>
                ),
              },
              { label: "Status reason", value: stack.status_reason },
              {
                label: "Created",
                value: formatDateTime(stack.creation_time),
              },
              {
                label: "Updated",
                value: formatDateTime(stack.updated_time) || "Never",
              },
              { label: "ID", value: <code>{stack.id}</code> },
              {
                label: "Description",
                value: stack.description || stack.template_description,
              },
            ]}
          />
        </Panel>
        <Panel title="Launch parameters">
          <KeyValueList
            items={[
              {
                label: "Timeout",
                value: formatWithUnit(stack.timeout_mins, "minutes"),
              },
              {
                label: "Rollback on failure",
                value: stack.disable_rollback === false ? "Yes" : "No",
              },
              { label: "Tags", value: stack.tags.join(", ") },
              { label: "Owner", value: stack.stack_owner },
            ]}
          />
        </Panel>
        <Panel title="Outputs">
          {stack.outputs.length === 0 ? (
            <p className={styles.muted}>None</p>
          ) : (
            <KeyValueList
              items={stack.outputs.map((output) => ({
                label: output.key ?? "",
                value: output.error ? (
                  <span>Error: {output.error}</span>
                ) : (
                  <span>
                    {output.description && (
                      <span className={styles.muted}>
                        {output.description}.{" "}
                      </span>
                    )}
                    <code>
                      {typeof output.value === "string"
                        ? output.value
                        : JSON.stringify(output.value)}
                    </code>
                  </span>
                ),
              }))}
            />
          )}
        </Panel>
        <Panel title="Stack parameters">
          {parameters.length === 0 ? (
            <p className={styles.muted}>None</p>
          ) : (
            <KeyValueList
              items={parameters.map(([key, value]) => ({
                label: key,
                value: (
                  <code>
                    {typeof value === "string" ? value : JSON.stringify(value)}
                  </code>
                ),
              }))}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
