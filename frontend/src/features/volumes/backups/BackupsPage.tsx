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
import type { VolumeBackup } from "../../../lib/api/types";
import { formatDateTime, formatGb } from "../../../lib/format";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { backupsRoute } from "../../../app/router";
import { backupsQuery } from "../api";
import { availableBackupActions, statusLabel, statusTone } from "../status";
import { useBackupActions } from "./BackupActions";
import styles from "./BackupsPage.module.scss";

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: "", label: "All statuses" },
  { id: "available", label: "Available" },
  { id: "creating", label: "Creating" },
  { id: "restoring", label: "Restoring" },
  { id: "error", label: "Error" },
];

export function BackupsPage() {
  const projectId = useProjectId();
  const search = backupsRoute.useSearch();
  const navigate = useNavigate({ from: backupsRoute.fullPath });
  const backups = useQuery(backupsQuery(projectId));
  const { run, runDelete, dialogs } = useBackupActions(projectId);

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

  const columns = useMemo<ColumnDef<VolumeBackup>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/storage/backups/$backupId"
            params={{ backupId: row.id }}
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
        id: "availability_zone",
        label: "Availability zone",
        cell: (row) => row.availability_zone ?? "",
        sortValue: (row) => row.availability_zone ?? "",
        hideBelow: "lg",
      },
      {
        id: "volume",
        label: "Volume",
        cell: (row) =>
          row.volume_id ? (
            row.volume_name ? (
              <RouterLink
                to="/storage/volumes/$volumeId"
                params={{ volumeId: row.volume_id }}
              >
                {row.volume_name}
              </RouterLink>
            ) : (
              <span className={styles.muted}>Deleted ({row.volume_id})</span>
            )
          ) : (
            ""
          ),
        sortValue: (row) => row.volume_name ?? row.volume_id ?? "",
        textValue: (row) => row.volume_name ?? row.volume_id ?? "",
        hideBelow: "md",
      },
      {
        id: "snapshot",
        label: "Snapshot",
        cell: (row) =>
          row.snapshot_id ? (
            row.snapshot_name ? (
              <RouterLink
                to="/storage/snapshots/$snapshotId"
                params={{ snapshotId: row.snapshot_id }}
              >
                {row.snapshot_name}
              </RouterLink>
            ) : (
              <span className={styles.muted}>Deleted</span>
            )
          ) : (
            ""
          ),
        hideBelow: "lg",
      },
      {
        id: "created",
        label: "Created",
        cell: (row) => formatDateTime(row.created_at),
        sortValue: (row) => row.created_at ?? "",
        hideBelow: "md",
      },
    ],
    [],
  );

  const rows = useMemo(() => {
    let list = backups.data?.items ?? [];
    if (status) list = list.filter((row) => row.status === status);
    return filterRows(list, q, columns);
  }, [backups.data, status, q, columns]);

  return (
    <>
      <PageHeader
        title="Volume Backups"
        crumbs={[{ label: "Project" }, { label: "Volumes" }]}
      />
      <DataTable
        id="volume-backups"
        label="Volume backups"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={backups.isPending}
        isFetching={backups.isFetching}
        error={backups.error}
        onRetry={() => void backups.refetch()}
        onRefresh={() => void backups.refetch()}
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
          backups.data && backups.data.items.length > 0
            ? "No backups match"
            : "No volume backups yet"
        }
        emptyBody={
          backups.data && backups.data.items.length === 0 ? (
            <p>
              Create a backup from a volume's row menu on the{" "}
              <RouterLink to="/storage/volumes" search={{}}>
                Volumes
              </RouterLink>{" "}
              page. Backups are kept in the object store.
            </p>
          ) : null
        }
        defaultSort={{ column: "created", direction: "descending" }}
        rowActions={(row) =>
          availableBackupActions(row).map((action) => ({
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
                  availableBackupActions(row).find((a) => a.id === "delete")
                    ?.isDisabled,
              ),
          },
        ]}
      />
      {dialogs}
    </>
  );
}
