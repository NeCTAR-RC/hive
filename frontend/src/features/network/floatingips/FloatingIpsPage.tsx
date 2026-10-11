import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { filterRows } from "../../../components/DataTable/filter";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { FloatingIp } from "../../../lib/api/types";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { floatingIpsRoute } from "../../../app/router";
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
import { AllocateFloatingIpDialog } from "./FloatingIpDialogs";

const CRUMBS = [{ label: "Project" }, { label: "Network" }];

export function FloatingIpsPage() {
  const projectId = useProjectId();
  const search = floatingIpsRoute.useSearch();
  const navigate = useNavigate({ from: floatingIpsRoute.fullPath });
  const fips = useQuery(floatingIpsQuery(projectId));
  const quota = useQuery(networkQuotaQuery(projectId));
  const extensions = useQuery(networkExtensionsQuery(projectId));
  const { run, runRelease, dialogs } = useFloatingIpActions(projectId);

  const q = search.q ?? "";
  const setSearch = (patch: { q?: string }) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous, ...patch };
        if (!next.q) delete next.q;
        return next;
      },
      replace: true,
    });
  const setAllocating = (open: boolean) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous };
        delete next.allocate;
        return open ? { ...next, allocate: true } : next;
      },
      replace: true,
    });

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
            <RouterLink
              to="/compute/instances/$instanceId"
              params={{ instanceId: row.instance_id }}
              search={{}}
            >
              {floatingIpTargetLabel(row)}
            </RouterLink>
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

  const rows = useMemo(
    () => filterRows(fips.data?.items ?? [], q, columns),
    [fips.data, q, columns],
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
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={fips.isPending}
        isFetching={fips.isFetching}
        error={fips.error}
        onRetry={() => void fips.refetch()}
        onRefresh={() => void fips.refetch()}
        search={{
          value: q,
          onChange: (value) => setSearch({ q: value }),
          placeholder: "Search by address, description or instance",
        }}
        resetKey={q}
        emptyTitle={
          fips.data && fips.data.items.length > 0
            ? "No floating IPs match"
            : "No floating IPs yet"
        }
        emptyBody={
          fips.data && fips.data.items.length === 0 ? (
            <p>
              Allocate a floating IP and associate it with an instance behind a
              router to reach the instance from outside.
            </p>
          ) : null
        }
        rowActions={(row) =>
          availableFloatingIpActions(row, extensions.data).map((action) => ({
            id: action.id,
            label: action.label,
            onAction: () => run(row, action.id),
            isDisabled: action.isDisabled,
            ...(action.disabledReason
              ? { disabledReason: action.disabledReason }
              : {}),
            ...(action.tone ? { tone: action.tone } : {}),
          }))
        }
        batchActions={[
          {
            id: "release",
            label: "Release",
            tone: "danger",
            onAction: (selected) => runRelease(selected),
            isDisabled: (selected) =>
              selected.some((row) => row.port_forwarding_count > 0),
          },
        ]}
      />
      {dialogs}
      <AllocateFloatingIpDialog
        key={search.allocate ? "open" : "closed"}
        projectId={projectId}
        isOpen={Boolean(search.allocate)}
        onOpenChange={setAllocating}
      />
    </>
  );
}
