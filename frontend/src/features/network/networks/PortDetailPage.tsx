// A port's detail page: its fields, addresses, device and groups.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { AppLink } from "../../../components/AppLink/AppLink";
import { RowActionsMenu } from "../../../components/DataTable/RowActionsMenu";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { toRowActions } from "../../../lib/actions";
import { formatDateTime } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import {
  networkExtensionsQuery,
  networkQuery,
  portQuery,
  securityGroupsQuery,
} from "../api";
import {
  adminStateLabel,
  availablePortActions,
  statusLabel,
  statusTone,
} from "../status";
import { AddressPairsPanel } from "./AddressPairsPanel";
import { AttachedDevice } from "./AttachedDevice";
import { usePortActions } from "./PortActions";
import styles from "./NetworkDetailPage.module.scss";

const portRoute = getRouteApi("/app/network/ports/$portId");

/**
 * One port with its actions in the header, and its allowed address pairs
 * where the cloud has the extension and the port keeps port security on
 * (Neutron refuses pairs without it), as Horizon's tab is offered.
 */
export function PortDetailPage() {
  const projectId = useProjectId();
  const { portId } = portRoute.useParams();
  const navigate = useNavigate();
  const port = useQuery(portQuery(projectId, portId));
  const networkId = port.data?.network_id ?? "";
  const network = useQuery({
    ...networkQuery(projectId, networkId),
    enabled: networkId !== "",
  });
  const groups = useQuery(securityGroupsQuery(projectId));
  const extensions = useQuery(networkExtensionsQuery(projectId));
  const pairsOffered = extensions.data?.allowed_address_pairs ?? false;
  const groupNames = useMemo(
    () => new Map((groups.data?.items ?? []).map((g) => [g.id, g.name])),
    [groups.data],
  );
  const actions = usePortActions(
    network.data,
    () =>
      void navigate({
        to: "/network/networks/$networkId",
        params: { networkId },
        search: { tab: "ports" },
      }),
  );
  const crumbs = [
    { label: "Project" },
    { label: "Network" },
    { label: "Networks", href: "/network/networks" },
    ...(network.data
      ? [
          {
            label: network.data.name,
            href: `/network/networks/${networkId}?tab=ports`,
          },
        ]
      : []),
  ];

  return (
    <>
      <DetailPage
        query={port}
        noun="port"
        id={portId}
        scope="visible"
        crumbs={crumbs}
        backTo={{ label: "networks", href: "/network/networks" }}
        title={(data) => data.name || data.id}
        actions={(data) => (
          <RowActionsMenu
            actions={toRowActions(availablePortActions(data), (id) =>
              actions.run(id, [data]),
            )}
          />
        )}
      >
        {(data) => (
          <div className={styles.stack}>
            <Panel title="Port">
              <KeyValueList
                items={[
                  { label: "Name", value: data.name },
                  { label: "ID", value: <code>{data.id}</code> },
                  {
                    label: "Network",
                    value: data.network_id ? (
                      <AppLink
                        to="/network/networks/$networkId"
                        params={{ networkId: data.network_id }}
                        search={{}}
                      >
                        {data.network_name ?? data.network_id}
                      </AppLink>
                    ) : null,
                  },
                  {
                    label: "Status",
                    value: (
                      <StatusPill tone={statusTone(data.status)}>
                        {statusLabel(data.status)}
                      </StatusPill>
                    ),
                  },
                  {
                    label: "Admin state",
                    value: adminStateLabel(data.admin_state_up),
                  },
                  {
                    label: "Fixed IPs",
                    value:
                      data.fixed_ips.length === 0 ? null : (
                        <ul className={styles.plainList}>
                          {data.fixed_ips.map((ip) => (
                            <li key={`${ip.ip_address}-${ip.subnet_id}`}>
                              <code>{ip.ip_address}</code>
                              {ip.subnet_id && (
                                <>
                                  {" on subnet "}
                                  <AppLink
                                    to="/network/subnets/$subnetId"
                                    params={{ subnetId: ip.subnet_id }}
                                  >
                                    {network.data?.subnets.find(
                                      (s) => s.id === ip.subnet_id,
                                    )?.name || ip.subnet_id}
                                  </AppLink>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      ),
                  },
                  {
                    label: "MAC address",
                    value: <code>{data.mac_address}</code>,
                  },
                  {
                    label: "Attached device",
                    value: <AttachedDevice port={data} />,
                  },
                  {
                    label: "Device ID",
                    value: data.device_id ? (
                      data.device_type === "compute" ? (
                        <AppLink
                          to="/compute/instances/$instanceId"
                          params={{ instanceId: data.device_id }}
                          search={{}}
                        >
                          {data.device_id}
                        </AppLink>
                      ) : (
                        <code>{data.device_id}</code>
                      )
                    ) : null,
                  },
                  { label: "Device owner", value: data.device_owner || null },
                  {
                    label: "Port security",
                    value:
                      data.port_security_enabled === null
                        ? null
                        : data.port_security_enabled
                          ? "Enabled"
                          : "Disabled",
                  },
                  {
                    label: "Security groups",
                    value:
                      data.security_groups.length === 0 ? null : (
                        <ul className={styles.plainList}>
                          {data.security_groups.map((id) => (
                            <li key={id}>
                              <AppLink
                                to="/network/security-groups/$groupId"
                                params={{ groupId: id }}
                              >
                                {groupNames.get(id) ?? id}
                              </AppLink>
                            </li>
                          ))}
                        </ul>
                      ),
                  },
                  { label: "VNIC type", value: data.vnic_type },
                  { label: "Created", value: formatDateTime(data.created_at) },
                  { label: "Updated", value: formatDateTime(data.updated_at) },
                ]}
              />
            </Panel>
            {pairsOffered && data.port_security_enabled !== false && (
              <AddressPairsPanel
                port={data}
                onRefresh={() => void port.refetch()}
              />
            )}
          </div>
        )}
      </DetailPage>
      {actions.dialogs}
    </>
  );
}
