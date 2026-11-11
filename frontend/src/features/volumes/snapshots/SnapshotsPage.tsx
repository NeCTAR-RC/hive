import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Label, Select, SelectItem } from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { AppLink } from "../../../components/AppLink/AppLink";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { allows, toRowActions } from "../../../lib/actions";
import type { VolumeSnapshot } from "../../../lib/api/types/volumes";
import { formatGb, formatRelative } from "../../../lib/format";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { snapshotsQuery } from "../api";
import { availableSnapshotActions, statusLabel, statusTone } from "../status";
import { useSnapshotActions } from "./SnapshotActions";

const snapshotsRoute = getRouteApi("/app/storage/snapshots");

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: "", label: "All statuses" },
  { id: "available", label: "Available" },
  { id: "creating", label: "Creating" },
  { id: "error", label: "Error" },
];

/**
 * The project's volume snapshots, filterable by status, with the snapshot
 * actions in each row and delete for a selection.
 */
export function SnapshotsPage() {
  const projectId = useProjectId();
  const search = useListSearch(snapshotsRoute);
  const status = search.params.status ?? "";
  const snapshots = useQuery(snapshotsQuery(projectId));
  const table = useQueryTable(snapshots, {
    noun: "volume snapshots",
    emptyTitle: "No volume snapshots yet",
    noMatchTitle: "No snapshots match",
    search,
    placeholder: "Search by name, description or volume",
    filter: status ? (row) => row.status === status : undefined,
    resetKey: status,
  });
  const { run, dialogs, tableProps } = useSnapshotActions();

  const columns = useMemo<ColumnDef<VolumeSnapshot>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/storage/snapshots/$snapshotId"
            params={{ snapshotId: row.id }}
          >
            {row.name || row.id}
          </AppLink>
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
            <AppLink
              size="sm"
              to="/storage/volumes/$volumeId"
              params={{ volumeId: row.volume_id }}
            >
              {row.volume_name || row.volume_id}
            </AppLink>
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

  return (
    <>
      <PageHeader
        title="Volume snapshots"
        crumbs={[{ label: "Project" }, { label: "Volumes" }]}
      />
      <DataTable
        id="volume-snapshots"
        label="Volume snapshots"
        columns={columns}
        getRowId={(row) => row.id}
        {...table}
        {...tableProps}
        filters={
          <Select
            aria-label="Status"
            labelPosition="side"
            selectedKey={status}
            onSelectionChange={(key: Key | null) =>
              search.patch({ status: key === null ? "" : String(key) })
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
        emptyBody={
          <p>
            Create a snapshot from a volume's row menu on the{" "}
            <AppLink to="/storage/volumes" search={{}}>
              Volumes
            </AppLink>{" "}
            page.
          </p>
        }
        defaultSort={{ column: "created", direction: "descending" }}
        rowActions={(row) =>
          toRowActions(availableSnapshotActions(row), (id) => run(id, [row]))
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (rows) => run("delete", rows),
            isDisabled: (rows) =>
              !rows.some((row) =>
                allows(availableSnapshotActions(row), "delete"),
              ),
          },
        ]}
      />
      {dialogs}
    </>
  );
}
