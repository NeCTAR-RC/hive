// The pool detail page's health monitor panel.
import { Button } from "@ardc-ui/react";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { HealthMonitor } from "../../../lib/api/types/loadbalancers";
import { formatWithUnit } from "../../../lib/format";
import { allows } from "../../../lib/actions";
import {
  availableMonitorActions,
  octaviaLock,
  provisioningLabel,
  provisioningTone,
} from "../status";
import { monitorRetries } from "./monitor";
import styles from "../LoadBalancers.module.scss";

/**
 * The pool's health monitor, with its timings and, for an HTTP monitor, its
 * check; or a note that there is none. `onEdit` opens the monitor dialog,
 * which creates one when there is none; `onDelete` asks to delete it. The
 * buttons are named for the monitor, as the pool's own actions sit beside
 * them, and wait while the load balancer (`lbStatus`) or the monitor is
 * PENDING_*, which the panel then says.
 */
export function HealthMonitorPanel({
  monitor,
  lbStatus,
  onEdit,
  onDelete,
}: {
  monitor: HealthMonitor | null;
  lbStatus: string | null;
  onEdit: () => void;
  onDelete: (monitor: HealthMonitor) => void;
}) {
  const offers = monitor ? availableMonitorActions(monitor, lbStatus) : [];
  const locked = octaviaLock(lbStatus, monitor?.provisioning_status);
  return (
    <Panel
      title="Health monitor"
      headingLevel={2}
      actions={
        monitor ? (
          <div className={styles.actions}>
            <Button
              variant="secondary"
              size="xs"
              aria-label="Edit health monitor"
              isDisabled={!allows(offers, "edit")}
              onPress={onEdit}
            >
              Edit
            </Button>
            <Button
              variant="secondary"
              tone="danger"
              size="xs"
              aria-label="Delete health monitor"
              isDisabled={!allows(offers, "delete")}
              onPress={() => onDelete(monitor)}
            >
              Delete
            </Button>
          </div>
        ) : (
          <Button size="xs" isDisabled={locked !== null} onPress={onEdit}>
            Create health monitor
          </Button>
        )
      }
    >
      {locked && <p className={styles.note}>{locked}.</p>}
      {monitor ? (
        <KeyValueList
          items={[
            { label: "Type", value: monitor.type },
            { label: "Delay", value: formatWithUnit(monitor.delay, "s") },
            { label: "Timeout", value: formatWithUnit(monitor.timeout, "s") },
            { label: "Retries up / down", value: monitorRetries(monitor) },
            ...(["HTTP", "HTTPS"].includes(monitor.type)
              ? [
                  {
                    label: "Check",
                    value: `${monitor.http_method ?? "GET"} ${monitor.url_path ?? "/"}`,
                  },
                  {
                    label: "Expected codes",
                    value: monitor.expected_codes ?? "200",
                  },
                ]
              : []),
            {
              label: "Status",
              value: (
                <StatusPill
                  tone={provisioningTone(monitor.provisioning_status)}
                >
                  {provisioningLabel(monitor.provisioning_status)}
                </StatusPill>
              ),
            },
          ]}
        />
      ) : (
        <p>No health monitor. Members are assumed healthy.</p>
      )}
    </Panel>
  );
}
