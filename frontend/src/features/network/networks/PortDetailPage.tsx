import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { RowActionsMenu } from "../../../components/DataTable/DataTable";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { ApiError } from "../../../lib/api/client";
import { formatDateTime } from "../../../lib/format";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { portRoute } from "../../../app/router";
import { networkQuery, portQuery, securityGroupsQuery } from "../api";
import {
  adminStateLabel,
  availablePortActions,
  portAttachmentLabel,
  statusLabel,
  statusTone,
} from "../status";
import { usePortActions } from "./NetworkActions";
import styles from "./NetworkDetailPage.module.scss";

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
  const groupNames = useMemo(
    () => new Map((groups.data?.items ?? []).map((g) => [g.id, g.name])),
    [groups.data],
  );
  const actions = usePortActions(
    projectId,
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

  if (port.isError) {
    const notFound =
      port.error instanceof ApiError && port.error.status === 404;
    return (
      <>
        <PageHeader
          title={notFound ? "Port not found" : "Port"}
          crumbs={crumbs}
        />
        {notFound ? (
          <p>
            There is no port <code>{portId}</code> visible to this project.{" "}
            <RouterLink to="/network/networks" search={{}}>
              Back to networks
            </RouterLink>
          </p>
        ) : (
          <ErrorState error={port.error} onRetry={() => void port.refetch()} />
        )}
      </>
    );
  }

  const data = port.data;
  return (
    <>
      <PageHeader
        title={data ? data.name || data.id : "Port"}
        crumbs={crumbs}
        actions={
          data && (
            <RowActionsMenu
              actions={availablePortActions(data).map((action) => ({
                id: action.id,
                label: action.label,
                onAction: () => actions.run(data, action.id),
                isDisabled: action.isDisabled,
                ...(action.disabledReason
                  ? { disabledReason: action.disabledReason }
                  : {}),
                ...(action.tone ? { tone: action.tone } : {}),
              }))}
            />
          )
        }
      />
      <div className={styles.overview}>
        {!data ? (
          <SkeletonLines lines={10} />
        ) : (
          <KeyValueList
            items={[
              { label: "Name", value: data.name },
              { label: "ID", value: <code>{data.id}</code> },
              {
                label: "Network",
                value: data.network_id ? (
                  <RouterLink
                    to="/network/networks/$networkId"
                    params={{ networkId: data.network_id }}
                    search={{}}
                  >
                    {data.network_name ?? data.network_id}
                  </RouterLink>
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
                              <RouterLink
                                to="/network/subnets/$subnetId"
                                params={{ subnetId: ip.subnet_id }}
                              >
                                {network.data?.subnets.find(
                                  (s) => s.id === ip.subnet_id,
                                )?.name || ip.subnet_id}
                              </RouterLink>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  ),
              },
              { label: "MAC address", value: <code>{data.mac_address}</code> },
              { label: "Attached device", value: portAttachmentLabel(data) },
              {
                label: "Device ID",
                value: data.device_id ? (
                  data.device_type === "compute" ? (
                    <RouterLink
                      to="/compute/instances/$instanceId"
                      params={{ instanceId: data.device_id }}
                      search={{}}
                    >
                      {data.device_id}
                    </RouterLink>
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
                          <RouterLink
                            to="/network/security-groups/$groupId"
                            params={{ groupId: id }}
                          >
                            {groupNames.get(id) ?? id}
                          </RouterLink>
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
        )}
      </div>
      {actions.dialogs}
    </>
  );
}
