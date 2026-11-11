import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Label, Select, SelectItem } from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import { DataTable } from "../../../components/DataTable/DataTable";
import { AppLink } from "../../../components/AppLink/AppLink";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { allows, toRowActions } from "../../../lib/actions";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { backupsQuery } from "../api";
import { availableBackupActions } from "../status";
import { useBackupActions } from "./BackupActions";
import { backupColumns } from "./backupColumns";

const backupsRoute = getRouteApi("/app/storage/backups");

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: "", label: "All statuses" },
  { id: "available", label: "Available" },
  { id: "creating", label: "Creating" },
  { id: "restoring", label: "Restoring" },
  { id: "error", label: "Error" },
];

/**
 * The project's volume backups, filterable by status, with restore and
 * delete from each row and delete for a selection.
 */
export function BackupsPage() {
  const projectId = useProjectId();
  const search = useListSearch(backupsRoute);
  const status = search.params.status ?? "";
  const backups = useQuery(backupsQuery(projectId));
  const table = useQueryTable(backups, {
    noun: "volume backups",
    emptyTitle: "No volume backups yet",
    noMatchTitle: "No backups match",
    search,
    placeholder: "Search by name, description or volume",
    filter: status ? (row) => row.status === status : undefined,
    resetKey: status,
  });
  const { run, dialogs, tableProps } = useBackupActions();

  return (
    <>
      <PageHeader
        title="Volume backups"
        crumbs={[{ label: "Project" }, { label: "Volumes" }]}
      />
      <DataTable
        id="volume-backups"
        label="Volume backups"
        columns={backupColumns}
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
            Create a backup from a volume's row menu on the{" "}
            <AppLink to="/storage/volumes" search={{}}>
              Volumes
            </AppLink>{" "}
            page. Backups are kept in the object store.
          </p>
        }
        defaultSort={{ column: "created", direction: "descending" }}
        rowActions={(row) =>
          toRowActions(availableBackupActions(row), (id) => run(id, [row]))
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (rows) => run("delete", rows),
            isDisabled: (rows) =>
              !rows.some((row) =>
                allows(availableBackupActions(row), "delete"),
              ),
          },
        ]}
      />
      {dialogs}
    </>
  );
}
