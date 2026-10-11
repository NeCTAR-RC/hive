import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { RowActionsMenu } from "../../../components/DataTable/DataTable";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { ApiError } from "../../../lib/api/client";
import { formatDateTime } from "../../../lib/format";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { subnetRoute } from "../../../app/router";
import { networkQuery, subnetQuery } from "../api";
import { availableSubnetActions } from "../status";
import { useSubnetActions } from "./NetworkActions";
import styles from "./NetworkDetailPage.module.scss";

export function SubnetDetailPage() {
  const projectId = useProjectId();
  const { subnetId } = subnetRoute.useParams();
  const navigate = useNavigate();
  const subnet = useQuery(subnetQuery(projectId, subnetId));
  const networkId = subnet.data?.network_id ?? "";
  const network = useQuery({
    ...networkQuery(projectId, networkId),
    enabled: networkId !== "",
  });
  const actions = useSubnetActions(
    projectId,
    network.data,
    () =>
      void navigate({
        to: "/network/networks/$networkId",
        params: { networkId },
        search: { tab: "subnets" },
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
            href: `/network/networks/${networkId}?tab=subnets`,
          },
        ]
      : []),
  ];

  if (subnet.isError) {
    const notFound =
      subnet.error instanceof ApiError && subnet.error.status === 404;
    return (
      <>
        <PageHeader
          title={notFound ? "Subnet not found" : "Subnet"}
          crumbs={crumbs}
        />
        {notFound ? (
          <p>
            There is no subnet <code>{subnetId}</code> visible to this project.{" "}
            <RouterLink to="/network/networks" search={{}}>
              Back to networks
            </RouterLink>
          </p>
        ) : (
          <ErrorState
            error={subnet.error}
            onRetry={() => void subnet.refetch()}
          />
        )}
      </>
    );
  }

  const data = subnet.data;
  return (
    <>
      <PageHeader
        title={data ? data.name || data.cidr || data.id : "Subnet"}
        crumbs={crumbs}
        actions={
          data &&
          network.data && (
            <RowActionsMenu
              actions={availableSubnetActions(data, network.data).map(
                (action) => ({
                  id: action.id,
                  label: action.label,
                  onAction: () => actions.run(data, action.id),
                  isDisabled: action.isDisabled,
                  ...(action.disabledReason
                    ? { disabledReason: action.disabledReason }
                    : {}),
                  ...(action.tone ? { tone: action.tone } : {}),
                }),
              )}
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
                    {network.data?.name ?? data.network_id}
                  </RouterLink>
                ) : null,
              },
              { label: "Network address", value: <code>{data.cidr}</code> },
              {
                label: "IP version",
                value: data.ip_version ? `IPv${data.ip_version}` : null,
              },
              {
                label: "Gateway IP",
                value: data.gateway_ip ? (
                  <code>{data.gateway_ip}</code>
                ) : (
                  "Disabled"
                ),
              },
              {
                label: "DHCP",
                value:
                  data.enable_dhcp === null
                    ? null
                    : data.enable_dhcp
                      ? "Enabled"
                      : "Disabled",
              },
              {
                label: "Allocation pools",
                value:
                  data.allocation_pools.length === 0 ? null : (
                    <ul className={styles.plainList}>
                      {data.allocation_pools.map((pool) => (
                        <li key={`${pool.start}-${pool.end}`}>
                          <code>
                            {pool.start} to {pool.end}
                          </code>
                        </li>
                      ))}
                    </ul>
                  ),
              },
              {
                label: "DNS name servers",
                value:
                  data.dns_nameservers.length === 0 ? null : (
                    <code>{data.dns_nameservers.join(", ")}</code>
                  ),
              },
              {
                label: "Host routes",
                value:
                  data.host_routes.length === 0 ? null : (
                    <ul className={styles.plainList}>
                      {data.host_routes.map((route) => (
                        <li key={`${route.destination}-${route.nexthop}`}>
                          <code>
                            {route.destination} via {route.nexthop}
                          </code>
                        </li>
                      ))}
                    </ul>
                  ),
              },
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
