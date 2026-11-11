// The Overview tab of a router's detail page.
import { AppLink } from "../../../../components/AppLink/AppLink";
import { KeyValueList } from "../../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../../components/Panel/Panel";
import { StatusPill } from "../../../../components/StatusPill/StatusPill";
import type { RouterDetail } from "../../../../lib/api/types/network";
import { formatDateTime } from "../../../../lib/format";
import { adminStateLabel, statusLabel, statusTone } from "../../status";

/** The router's fields, with its gateway's network, address and SNAT. */
export function OverviewTab({ router }: { router: RouterDetail }) {
  const gateway = router.external_gateway;
  return (
    <Panel title="Router">
      <KeyValueList
        items={[
          { label: "Name", value: router.name },
          { label: "ID", value: <code>{router.id}</code> },
          { label: "Description", value: router.description || null },
          {
            label: "Status",
            value: (
              <StatusPill tone={statusTone(router.status)}>
                {statusLabel(router.status)}
              </StatusPill>
            ),
          },
          {
            label: "Admin state",
            value: adminStateLabel(router.admin_state_up),
          },
          {
            label: "External network",
            value: gateway ? (
              gateway.network_id ? (
                <AppLink
                  to="/network/networks/$networkId"
                  params={{ networkId: gateway.network_id }}
                  search={{}}
                >
                  {gateway.network_name ?? gateway.network_id}
                </AppLink>
              ) : (
                gateway.network_name
              )
            ) : (
              "No gateway"
            ),
          },
          {
            label: "External address",
            value:
              gateway && gateway.fixed_ips.length > 0 ? (
                <code>
                  {gateway.fixed_ips.map((ip) => ip.ip_address).join(", ")}
                </code>
              ) : null,
          },
          {
            label: "SNAT",
            value: gateway
              ? gateway.enable_snat === null
                ? null
                : gateway.enable_snat
                  ? "Enabled"
                  : "Disabled"
              : null,
          },
          {
            label: "Availability zones",
            value: router.availability_zones.join(", ") || null,
          },
          { label: "Created", value: formatDateTime(router.created_at) },
          { label: "Updated", value: formatDateTime(router.updated_at) },
        ]}
      />
    </Panel>
  );
}
