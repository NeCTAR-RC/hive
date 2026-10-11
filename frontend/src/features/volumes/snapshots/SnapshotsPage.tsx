import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { Label, Select, SelectItem } from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { filterRows } from "../../../components/DataTable/filter";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { VolumeSnapshot } from "../../../lib/api/types";
import { formatGb, formatRelative } from "../../../lib/format";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { snapshotsRoute } from "../../../app/router";
import { snapshotsQuery } from "../api";
import { availableSnapshotActions, statusLabel, statusTone } from "../status";
import { useSnapshotActions } from "./SnapshotActions";
import styles from "./SnapshotsPage.module.scss";

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: "", label: "All statuses" },
  { id: "available", label: "Available" },
  { id: "creating", label: "Creating" },
  { id: "error", label: "Error" },
];

export function SnapshotsPage() {
  const projectId = useProjectId();
  const search = snapshotsRoute.useSearch();
  const navigate = useNavigate({ from: snapshotsRoute.fullPath });
  const snapshots = useQuery(snapshotsQuery(projectId));
  const { run, runDelete, dialogs } = useSnapshotActions(projectId);

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

  const columns = useMemo<ColumnDef<VolumeSnapshot>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/storage/snapshots/$snapshotId"
            params={{ snapshotId: row.id }}
          >
            {row.name || row.id}
          </RouterLink>
        ),
        sortValue: (row) => row.name || row.id,
        textValue: (row) => `${row.name} ${row.id}`,
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => row.description ?? "",
        textValue: (row) => row.description ?? "",
        hideBelow: "lg",
      },
      {
        id: "size",
        label: "Size",
        cell: (row) => formatGb(row.size_gb),
        sortValue: (row) => row.size_gb ?? 0,
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row.status)}>
            {statusLabel(row.status)}
          </StatusPill>
        ),
        sortValue: (row) => row.status,
      },
      {
        id: "volume",
        label: "Volume",
        cell: (row) =>
          row.volume_id ? (
            <RouterLink
              to="/storage/volumes/$volumeId"
              params={{ volumeId: row.volume_id }}
            >
              {row.volume_name || row.volume_id}
            </RouterLink>
          ) : (
            ""
          ),
        sortValue: (row) => row.volume_name ?? row.volume_id ?? "",
        textValue: (row) => row.volume_name ?? row.volume_id ?? "",
        hideBelow: "md",
      },
      {
        id: "created",
        label: "Age",
        cell: (row) =>
          row.created_at ? (
            <time dateTime={row.created_at} title={row.created_at}>
              {formatRelative(row.created_at)}
            </time>
          ) : (
            ""
          ),
        sortValue: (row) => row.created_at ?? "",
        hideBelow: "md",
      },
    ],
    [],
  );

  const rows = useMemo(() => {
    let list = snapshots.data?.items ?? [];
    if (status) list = list.filter((row) => row.status === status);
    return filterRows(list, q, columns);
  }, [snapshots.data, status, q, columns]);

  return (
    <>
      <PageHeader
        title="Volume Snapshots"
        crumbs={[{ label: "Project" }, { label: "Volumes" }]}
      />
      <DataTable
        id="volume-snapshots"
        label="Volume snapshots"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={snapshots.isPending}
        isFetching={snapshots.isFetching}
        error={snapshots.error}
        onRetry={() => void snapshots.refetch()}
        onRefresh={() => void snapshots.refetch()}
        search={{
          value: q,
          onChange: (value) => setSearch({ q: value }),
          placeholder: "Search by name, description or volume",
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
          snapshots.data && snapshots.data.items.length > 0
            ? "No snapshots match"
            : "No volume snapshots yet"
        }
        emptyBody={
          snapshots.data && snapshots.data.items.length === 0 ? (
            <p>
              Create a snapshot from a volume's row menu on the{" "}
              <RouterLink to="/storage/volumes" search={{}}>
                Volumes
              </RouterLink>{" "}
              page.
            </p>
          ) : null
        }
        defaultSort={{ column: "created", direction: "descending" }}
        rowActions={(row) =>
          availableSnapshotActions(row).map((action) => ({
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
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => runDelete(selected),
            isDisabled: (selected) =>
              selected.some(
                (row) =>
                  availableSnapshotActions(row).find((a) => a.id === "delete")
                    ?.isDisabled,
              ),
          },
        ]}
      />
      {dialogs}
    </>
  );
}
