// The Overview tab of a network's detail page.
import { KeyValueList } from "../../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../../components/Panel/Panel";
import { StatusPill } from "../../../../components/StatusPill/StatusPill";
import type { NetworkDetail } from "../../../../lib/api/types/network";
import { formatDateTime } from "../../../../lib/format";
import { adminStateLabel, statusLabel, statusTone } from "../../status";

/** The network's fields, with who owns it in words. */
export function OverviewTab({ network }: { network: NetworkDetail }) {
  return (
    <Panel title="Network">
      <KeyValueList
        items={[
          { label: "Name", value: network.name },
          { label: "ID", value: <code>{network.id}</code> },
          { label: "Description", value: network.description || null },
          {
            label: "Status",
            value: (
              <StatusPill tone={statusTone(network.status)}>
                {statusLabel(network.status)}
              </StatusPill>
            ),
          },
          {
            label: "Admin state",
            value: adminStateLabel(network.admin_state_up),
          },
          { label: "Shared", value: network.is_shared ? "Yes" : "No" },
          { label: "External", value: network.is_external ? "Yes" : "No" },
          {
            label: "Owner",
            value: network.is_project
              ? "This project"
              : network.is_classic
                ? "Nectar (classic provider network)"
                : "Another project (shared with you)",
          },
          { label: "MTU", value: network.mtu },
          {
            label: "Port security",
            value:
              network.port_security_enabled === null
                ? null
                : network.port_security_enabled
                  ? "Enabled"
                  : "Disabled",
          },
          {
            label: "Availability zones",
            value: network.availability_zones.join(", ") || null,
          },
          { label: "Tags", value: network.tags.join(", ") || null },
          { label: "Created", value: formatDateTime(network.created_at) },
          { label: "Updated", value: formatDateTime(network.updated_at) },
        ]}
      />
    </Panel>
  );
}
