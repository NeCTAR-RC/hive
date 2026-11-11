// The Floating IPs list, with Allocate IP to project while the quota has
// room.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { AppLink } from "../../../components/AppLink/AppLink";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { allows, toRowActions } from "../../../lib/actions";
import type { FloatingIp } from "../../../lib/api/types/network";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import {
  floatingIpsQuery,
  networkExtensionsQuery,
  networkQuotaQuery,
} from "../api";
import {
  availableFloatingIpActions,
  floatingIpTargetLabel,
  quotaLeft,
  statusLabel,
  statusTone,
} from "../status";
import { useFloatingIpActions } from "./FloatingIpActions";
import { AllocateFloatingIpDialog } from "./dialogs/AllocateFloatingIpDialog";

const floatingIpsRoute = getRouteApi("/app/network/floating-ips");

const CRUMBS = [{ label: "Project" }, { label: "Network" }];

/** The Floating IPs list page with its row and batch actions. */
export function FloatingIpsPage() {
  const projectId = useProjectId();
  const search = useListSearch(floatingIpsRoute);
  const navigate = floatingIpsRoute.useNavigate();
  const fips = useQuery(floatingIpsQuery(projectId));
  const table = useQueryTable(fips, {
    noun: "floating IPs",
    search,
    placeholder: "Search by address, description or instance",
  });
  const quota = useQuery(networkQuotaQuery(projectId));
  const extensions = useQuery(networkExtensionsQuery(projectId));
  const actions = useFloatingIpActions();
  const setAllocating = (allocate: boolean) => search.patch({ allocate });

  const dns = extensions.data?.dns_integration ?? false;
  const columns = useMemo<ColumnDef<FloatingIp>[]>(
    () => [
      {
        id: "address",
        label: "IP address",
        isRowHeader: true,
        cell: (row) => <code>{row.floating_ip_address}</code>,
        sortValue: (row) => row.floating_ip_address ?? "",
        textValue: (row) => `${row.floating_ip_address ?? ""} ${row.id}`,
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => row.description,
        textValue: (row) => row.description,
        hideBelow: "lg",
      },
      ...(dns
        ? [
            {
              id: "dns",
              label: "DNS name",
              cell: (row: FloatingIp) =>
                [row.dns_name, row.dns_domain].filter(Boolean).join("."),
              hideBelow: "lg" as const,
              defaultHidden: true,
            },
          ]
        : []),
      {
        id: "target",
        label: "Mapped fixed IP",
        cell: (row) =>
          row.instance_id && row.instance_type === "compute" ? (
            <AppLink
              size="sm"
              to="/compute/instances/$instanceId"
              params={{ instanceId: row.instance_id }}
              search={{}}
            >
              {floatingIpTargetLabel(row)}
            </AppLink>
          ) : (
            floatingIpTargetLabel(row)
          ),
        sortValue: (row) => floatingIpTargetLabel(row),
        textValue: (row) => floatingIpTargetLabel(row),
      },
      {
        id: "pool",
        label: "Pool",
        cell: (row) => row.pool_name ?? row.floating_network_id ?? "",
        sortValue: (row) => row.pool_name ?? "",
        hideBelow: "md",
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row.status)}>
            {statusLabel(row.status)}
          </StatusPill>
        ),
        sortValue: (row) => row.status ?? "",
      },
      {
        id: "forwardings",
        label: "Port forwarding rules",
        cell: (row) =>
          row.port_forwarding_count > 0 ? row.port_forwarding_count : "",
        sortValue: (row) => row.port_forwarding_count,
        hideBelow: "lg",
        defaultHidden: !extensions.data?.port_forwarding,
      },
    ],
    [dns, extensions.data],
  );
  const canAllocate = quotaLeft(quota.data, "floatingip");
  return (
    <>
      <PageHeader
        title="Floating IPs"
        crumbs={CRUMBS}
        actions={
          <>
            {extensions.data?.port_forwarding && (
              <Button
                variant="secondary"
                size="sm"
                onPress={() =>
                  void navigate({ to: "/network/port-forwardings", search: {} })
                }
              >
                Port forwarding rules
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onPress={() => setAllocating(true)}
              isDisabled={!canAllocate}
            >
              {canAllocate
                ? "Allocate IP to project"
                : "Allocate IP to project (quota exceeded)"}
            </Button>
          </>
        }
      />
      <DataTable
        id="floating-ips"
        label="Floating IPs"
        columns={columns}
        getRowId={(row) => row.id}
        {...table}
        {...actions.tableProps}
        emptyBody={
          <p>
            Allocate a floating IP and associate it with an instance behind a
            router to reach the instance from outside.
          </p>
        }
        rowActions={(row) =>
          toRowActions(availableFloatingIpActions(row, extensions.data), (id) =>
            actions.run(id, [row]),
          )
        }
        batchActions={[
          {
            id: "release",
            label: "Release",
            tone: "danger",
            onAction: (selected) => actions.run("release", selected),
            isDisabled: (selected) =>
              !selected.some((row) =>
                allows(availableFloatingIpActions(row), "release"),
              ),
          },
        ]}
      />
      {actions.dialogs}
      {search.params.allocate && (
        <AllocateFloatingIpDialog onClose={() => setAllocating(false)} />
      )}
    </>
  );
}
