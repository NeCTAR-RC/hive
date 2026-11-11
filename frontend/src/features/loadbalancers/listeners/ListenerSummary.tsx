// The listener detail page's summary: the listener's settings and its
// timeouts, side by side.
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { Listener, Pool } from "../../../lib/api/types/loadbalancers";
import { formatWithUnit } from "../../../lib/format";
import { provisioningLabel, provisioningTone } from "../status";
import styles from "../LoadBalancers.module.scss";

/**
 * The listener's protocol, status, default pool (named from `pools`),
 * limits, sources, inserted headers and certificate, and its timeouts in
 * milliseconds.
 */
export function ListenerSummary({
  listener,
  pools,
}: {
  listener: Listener;
  pools: Pool[];
}) {
  return (
    <div className={styles.grid}>
      <Panel title="Listener" headingLevel={2}>
        <KeyValueList
          items={[
            { label: "ID", value: <code>{listener.id}</code> },
            {
              label: "Protocol",
              value: `${listener.protocol} on port ${listener.protocol_port}`,
            },
            {
              label: "Status",
              value: (
                <StatusPill
                  tone={provisioningTone(listener.provisioning_status)}
                >
                  {provisioningLabel(listener.provisioning_status)}
                </StatusPill>
              ),
            },
            {
              label: "Admin state",
              value: listener.admin_state_up ? "Up" : "Down",
            },
            { label: "Description", value: listener.description },
            {
              label: "Default pool",
              value:
                pools.find((p) => p.id === listener.default_pool_id)?.name ||
                listener.default_pool_id ||
                "None",
            },
            {
              label: "Connection limit",
              value:
                listener.connection_limit === -1
                  ? "Unlimited"
                  : listener.connection_limit,
            },
            {
              label: "Allowed CIDRs",
              value: listener.allowed_cidrs.length
                ? listener.allowed_cidrs.join(", ")
                : "All",
            },
            {
              label: "Inserted headers",
              value:
                Object.keys(listener.insert_headers)
                  .filter((k) => listener.insert_headers[k] === "true")
                  .join(", ") || "None",
            },
            ...(listener.default_tls_container_ref
              ? [
                  {
                    label: "TLS certificate",
                    value: <code>{listener.default_tls_container_ref}</code>,
                  },
                ]
              : []),
          ]}
        />
      </Panel>
      <Panel title="Timeouts" headingLevel={2}>
        <KeyValueList
          items={[
            {
              label: "Client data",
              value: formatWithUnit(listener.timeout_client_data, "ms"),
            },
            {
              label: "Member connect",
              value: formatWithUnit(listener.timeout_member_connect, "ms"),
            },
            {
              label: "Member data",
              value: formatWithUnit(listener.timeout_member_data, "ms"),
            },
            {
              label: "TCP inspect",
              value: formatWithUnit(listener.timeout_tcp_inspect, "ms"),
            },
          ]}
        />
      </Panel>
    </div>
  );
}
