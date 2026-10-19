import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Label, Select, SelectItem } from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { filterRows } from "../../../components/DataTable/filter";
import { RouteLink } from "../../../components/RouteLink/RouteLink";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { Instance } from "../../../lib/api/types";
import { formatRelative, formatSuRate } from "../../../lib/format";
import { risksQuery } from "../../../lib/queries";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { instancesRoute } from "../../../app/router";
import { instancesQuery } from "../api";
import { useInstanceActions } from "./InstanceActions";
import {
  addressSummary,
  availableActions,
  batchTargets,
  powerStateLabel,
  statusLabel,
  statusTone,
} from "./status";
import type { InstanceActionId } from "./status";
import styles from "./InstancesPage.module.scss";

// Batch actions run only on the selected rows they apply to; the rest are
// named as skipped (batchTargets).
const BATCH_ACTIONS: {
  id: InstanceActionId;
  label: string;
  tone?: "danger";
}[] = [
  { id: "start", label: "Start" },
  { id: "stop", label: "Shut off" },
  { id: "soft-reboot", label: "Soft reboot" },
  { id: "delete", label: "Delete", tone: "danger" },
];

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: "", label: "All statuses" },
  { id: "ACTIVE", label: "Active" },
  { id: "SHUTOFF", label: "Shut off" },
  { id: "ERROR", label: "Error" },
  { id: "BUILD", label: "Building" },
  { id: "PAUSED", label: "Paused" },
  { id: "SUSPENDED", label: "Suspended" },
  { id: "SHELVED_OFFLOADED", label: "Shelved" },
  { id: "VERIFY_RESIZE", label: "Verify resize" },
];

export function InstancesPage() {
  const projectId = useProjectId();
  const search = instancesRoute.useSearch();
  const navigate = useNavigate({ from: instancesRoute.fullPath });
  const instances = useQuery(instancesQuery(projectId));
  const risks = useQuery(risksQuery(projectId));
  const { run, dialogs } = useInstanceActions(projectId);

  const q = search.q ?? "";
  const status = search.status ?? "";
  const setSearch = (patch: { q?: string; status?: string }) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous, ...patch };
        if (!next.q) delete next.q;
        if (!next.status) delete next.status;
        return next;
      },
      replace: true,
    });

  const riskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const risk of risks.data?.items ?? []) {
      counts.set(risk.resource_id, (counts.get(risk.resource_id) ?? 0) + 1);
    }
    return counts;
  }, [risks.data]);

  const columns = useMemo<ColumnDef<Instance>[]>(
    () => [
      {
        id: "name",
        label: "Instance name",
        isRowHeader: true,
        cell: (row) => (
          <RouteLink
            to="/compute/instances/$instanceId"
            params={{ instanceId: row.id }}
          >
            {row.name}
          </RouteLink>
        ),
        sortValue: (row) => row.name,
        textValue: (row) => `${row.name} ${row.id}`,
      },
      {
        id: "image",
        label: "Image name",
        cell: (row) =>
          row.boot_from_volume
            ? "Boot from volume"
            : (row.image?.name ?? row.image?.id ?? ""),
        sortValue: (row) => row.image?.name ?? "",
        textValue: (row) => row.image?.name ?? "",
        hideBelow: "lg",
      },
      {
        id: "addresses",
        label: "IP address",
        cell: (row) => (
          <ul className={styles.addresses}>
            {addressSummary(row).map((address) => (
              <li key={address}>{address}</li>
            ))}
          </ul>
        ),
        textValue: (row) => addressSummary(row).join(" "),
      },
      {
        id: "flavor",
        label: "Flavour",
        cell: (row) =>
          row.flavor ? (
            <span>
              {row.flavor.name}
              {row.flavor.su_rate !== null && (
                <span className={styles.muted}>
                  {" "}
                  {formatSuRate(row.flavor.su_rate)}
                </span>
              )}
            </span>
          ) : (
            ""
          ),
        sortValue: (row) => row.flavor?.name ?? "",
        textValue: (row) => row.flavor?.name ?? "",
        hideBelow: "md",
      },
      {
        id: "key_name",
        label: "Key pair",
        cell: (row) => row.key_name ?? "",
        sortValue: (row) => row.key_name ?? "",
        hideBelow: "lg",
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row)}>{statusLabel(row)}</StatusPill>
        ),
        sortValue: (row) => row.status,
      },
      {
        id: "risks",
        label: "Security risks",
        cell: (row) => {
          const count = riskCounts.get(row.id) ?? 0;
          return count > 0 ? (
            <RouteLink
              to="/security/risks"
              hash={row.id}
              className={styles.riskLink}
              aria-label={`${count} security ${count === 1 ? "risk" : "risks"}`}
            >
              <StatusPill tone="danger">{`${count} ${count === 1 ? "risk" : "risks"}`}</StatusPill>
            </RouteLink>
          ) : (
            ""
          );
        },
        sortValue: (row) => riskCounts.get(row.id) ?? 0,
        hideBelow: "lg",
        defaultHidden: !risks.data || risks.data.items.length === 0,
      },
      {
        id: "availability_zone",
        label: "Availability zone",
        cell: (row) => row.availability_zone ?? "",
        sortValue: (row) => row.availability_zone ?? "",
        hideBelow: "lg",
      },
      {
        id: "power_state",
        label: "Power state",
        cell: (row) => powerStateLabel(row),
        sortValue: (row) => row.power_state,
        hideBelow: "lg",
      },
      {
        id: "created",
        label: "Age",
        cell: (row) => (
          <time dateTime={row.created} title={row.created}>
            {formatRelative(row.created)}
          </time>
        ),
        sortValue: (row) => row.created,
        hideBelow: "md",
      },
    ],
    [riskCounts, risks.data],
  );

  const rows = useMemo(() => {
    let list = instances.data?.items ?? [];
    if (status) list = list.filter((row) => row.status === status);
    return filterRows(list, q, columns);
  }, [instances.data, status, q, columns]);

  return (
    <>
      <PageHeader
        title="Instances"
        crumbs={[{ label: "Project" }, { label: "Compute" }]}
        actions={
          <RouteLink
            variant="primary"
            size="sm"
            to="/compute/instances/launch"
            search={{}}
          >
            Launch instance
          </RouteLink>
        }
      />
      <DataTable
        id="instances"
        label="Instances"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={instances.isPending}
        isFetching={instances.isFetching}
        error={instances.error}
        onRetry={() => void instances.refetch()}
        onRefresh={() => void instances.refetch()}
        search={{
          value: q,
          onChange: (value) => setSearch({ q: value }),
          placeholder: "Search by name, image or address",
        }}
        resetKey={`${q}|${status}`}
        filters={
          <Select
            aria-label="Status"
            labelPosition="side"
            className={styles.statusFilter}
            selectedKey={status}
            onSelectionChange={(key: Key | null) =>
              setSearch({ status: key === null ? "" : String(key) })
            }
          >
            <Label>Status</Label>
            {STATUS_FILTERS.map((option) => (
              <SelectItem
                key={option.id}
                id={option.id}
                textValue={option.label}
              >
                {option.label}
              </SelectItem>
            ))}
          </Select>
        }
        emptyTitle={
          instances.data && instances.data.items.length > 0
            ? "No instances match"
            : "No instances yet"
        }
        emptyBody={
          instances.data && instances.data.items.length === 0 ? (
            <p>Launch your first instance to get started.</p>
          ) : null
        }
        defaultSort={{ column: "created", direction: "descending" }}
        rowActions={(row) =>
          availableActions(row).map((action) => ({
            id: action.id,
            label: action.label,
            onAction: () => run([row], action.id),
            isDisabled: action.isDisabled,
            ...(action.disabledReason
              ? { disabledReason: action.disabledReason }
              : {}),
            ...(action.tone ? { tone: action.tone } : {}),
          }))
        }
        batchActions={BATCH_ACTIONS.map(({ id, label, tone }) => ({
          id,
          label,
          ...(tone ? { tone } : {}),
          onAction: (selected: Instance[]) => {
            const { allowed, skipped } = batchTargets(selected, id);
            run(allowed, id, skipped);
          },
          isDisabled: (selected: Instance[]) =>
            batchTargets(selected, id).allowed.length === 0,
        }))}
      />
      {dialogs}
    </>
  );
}
