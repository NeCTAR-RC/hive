// The pool detail page's summary panel.
import { Fragment } from "react";
import { AppLink } from "../../../components/AppLink/AppLink";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { Listener, Pool } from "../../../lib/api/types/loadbalancers";
import { humanise } from "../../../lib/status";
import { provisioningLabel, provisioningTone } from "../status";

/**
 * The pool's protocol, algorithm, status, session persistence and the
 * listeners it serves, named from `listeners` and linked to their pages
 * on load balancer `lbId`.
 */
export function PoolSummary({
  lbId,
  pool,
  listeners,
}: {
  lbId: string;
  pool: Pool;
  listeners: Listener[];
}) {
  return (
    <Panel title="Pool" headingLevel={2}>
      <KeyValueList
        items={[
          { label: "ID", value: <code>{pool.id}</code> },
          { label: "Protocol", value: pool.protocol },
          {
            label: "Algorithm",
            value: pool.lb_algorithm ? humanise(pool.lb_algorithm) : undefined,
          },
          {
            label: "Status",
            value: (
              <StatusPill tone={provisioningTone(pool.provisioning_status)}>
                {provisioningLabel(pool.provisioning_status)}
              </StatusPill>
            ),
          },
          {
            label: "Admin state",
            value: pool.admin_state_up ? "Up" : "Down",
          },
          { label: "Description", value: pool.description },
          {
            label: "Session persistence",
            value: pool.session_persistence
              ? `${humanise(pool.session_persistence.type)}${pool.session_persistence.cookie_name ? ` (${pool.session_persistence.cookie_name})` : ""}`
              : "None",
          },
          {
            label: "Listeners",
            value: pool.listeners.length
              ? pool.listeners.map((id, index) => (
                  <Fragment key={id}>
                    {index > 0 && ", "}
                    <AppLink
                      to="/load-balancers/$lbId/listeners/$listenerId"
                      params={{ lbId, listenerId: id }}
                    >
                      {listeners.find((l) => l.id === id)?.name || id}
                    </AppLink>
                  </Fragment>
                ))
              : "None",
          },
        ]}
      />
    </Panel>
  );
}
