// A subnet's detail page: its fields, pools, name servers and routes.
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { AppLink } from "../../../components/AppLink/AppLink";
import { RowActionsMenu } from "../../../components/DataTable/RowActionsMenu";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { toRowActions } from "../../../lib/actions";
import { formatDateTime } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { networkQuery, subnetQuery } from "../api";
import { availableSubnetActions } from "../status";
import { useSubnetActions } from "./SubnetActions";
import styles from "./NetworkDetailPage.module.scss";

const subnetRoute = getRouteApi("/app/network/subnets/$subnetId");

/** One subnet with its actions in the header. */
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

  return (
    <>
      <DetailPage
        query={subnet}
        noun="subnet"
        id={subnetId}
        scope="visible"
        crumbs={crumbs}
        backTo={{ label: "networks", href: "/network/networks" }}
        title={(data) => data.name || data.cidr || data.id}
        actions={(data) =>
          network.data && (
            <RowActionsMenu
              actions={toRowActions(
                availableSubnetActions(data, network.data),
                (id) => actions.run(id, [data]),
              )}
            />
          )
        }
      >
        {(data) => (
          <Panel title="Subnet">
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
                      {network.data?.name ?? data.network_id}
                    </AppLink>
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
          </Panel>
        )}
      </DetailPage>
      {actions.dialogs}
    </>
  );
}
