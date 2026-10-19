// Database backups (trove-dashboard database_backups panel) and one
// backup's detail.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { filterRows } from "../../components/DataTable/filter";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { QuotaMeter } from "../../components/QuotaMeter/QuotaMeter";
import { RouteLink } from "../../components/RouteLink/RouteLink";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import type { DbBackup } from "../../lib/api/types";
import { formatDateTime } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { dbBackupRoute, dbBackupsRoute } from "../../app/router";
import { dbBackupQuery, dbBackupsQuery, useDeleteBackup } from "./api";
import { CreateBackupDialog } from "./BackupDialogs";
import { quotaLimit, statusLabel, statusTone } from "./status";
import styles from "./Databases.module.scss";

export function DbBackupsPage() {
  const projectId = useProjectId();
  const search = dbBackupsRoute.useSearch();
  const navigate = useNavigate({ from: dbBackupsRoute.fullPath });
  const backups = useQuery(dbBackupsQuery(projectId));
  const remove = useDeleteBackup(projectId);
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<DbBackup[]>([]);
  const creating = search.create === true;
  const setCreating = (open: boolean) =>
    void navigate({
      search: open
        ? {
            create: true,
            ...(search.instance ? { instance: search.instance } : {}),
          }
        : {},
      replace: true,
    });

  const columns = useMemo<ColumnDef<DbBackup>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouteLink
            to="/databases/backups/$backupId"
            params={{ backupId: row.id }}
          >
            {row.name || row.id}
          </RouteLink>
        ),
        sortValue: (row) => row.name ?? row.id,
        textValue: (row) =>
          `${row.name ?? ""} ${row.id} ${row.instance_name ?? ""} ${row.datastore ?? ""}`,
      },
      {
        id: "datastore",
        label: "Datastore",
        cell: (row) => row.datastore ?? "",
        hideBelow: "md",
      },
      {
        id: "version",
        label: "Datastore version",
        cell: (row) => row.datastore_version ?? "",
        hideBelow: "lg",
      },
      {
        id: "created",
        label: "Created",
        cell: (row) => formatDateTime(row.created) || "",
        sortValue: (row) => row.created ?? "",
        hideBelow: "md",
      },
      {
        id: "instance",
        label: "Database",
        cell: (row) =>
          row.instance_id ? (
            <RouteLink
              to="/databases/instances/$instanceId"
              params={{ instanceId: row.instance_id }}
            >
              {row.instance_name || row.instance_id}
            </RouteLink>
          ) : (
            ""
          ),
        sortValue: (row) => row.instance_name ?? "",
      },
      {
        id: "incremental",
        label: "Incremental",
        cell: (row) => (row.incremental ? "Yes" : "No"),
        hideBelow: "lg",
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row.status_kind)}>
            {statusLabel(row.status)}
          </StatusPill>
        ),
        sortValue: (row) => row.status ?? "",
      },
    ],
    [],
  );
  const rows = useMemo(
    () => filterRows(backups.data?.items ?? [], query, columns),
    [backups.data, query, columns],
  );
  const quota = backups.data?.quota;
  const count = backups.data?.items.length ?? 0;

  const confirmDelete = async () => {
    const results = await Promise.allSettled(
      deleting.map((b) => remove.mutateAsync(b.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        deleting.length === 1
          ? `Deleting backup ${deleting[0]?.name || deleting[0]?.id}.`
          : `Deleting ${deleting.length} backups.`,
      );
    } else {
      notify.danger(
        `Could not delete ${failed} of ${deleting.length} backups.`,
      );
    }
    setDeleting([]);
  };

  return (
    <>
      <PageHeader
        title="Database Backups"
        crumbs={[{ label: "Project" }, { label: "Database" }]}
        actions={
          <Button
            size="sm"
            onPress={() => setCreating(true)}
            isDisabled={(backups.data?.instances.length ?? 1) === 0}
          >
            Create backup
          </Button>
        }
      >
        {quota && quota.max_backups !== null && (
          <div className={styles.meters}>
            <QuotaMeter
              label="Backups"
              value={count}
              max={quota.max_backups}
              valueText={`${count} of ${quotaLimit(quota.max_backups).toLowerCase()} backups`}
            />
          </div>
        )}
      </PageHeader>
      <DataTable
        id="db-backups"
        label="Database backups"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={backups.isPending}
        isFetching={backups.isFetching}
        error={backups.error}
        onRetry={() => void backups.refetch()}
        onRefresh={() => void backups.refetch()}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search backups",
        }}
        resetKey={query}
        emptyTitle={
          backups.data?.items.length
            ? "No backups match"
            : "No database backups yet"
        }
        emptyBody={
          backups.data?.items.length === 0 ? (
            <p>Back up an active instance to restore it later.</p>
          ) : null
        }
        defaultSort={{ column: "created", direction: "descending" }}
        rowActions={(row) => [
          {
            id: "restore",
            label: "Restore to a new instance",
            isDisabled: !row.can_restore,
            disabledReason: "Only completed backups can be restored.",
            onAction: () =>
              void navigate({
                to: "/databases/instances/new",
                search: { backup: row.id },
              }),
          },
          {
            id: "delete",
            label: "Delete backup",
            tone: "danger",
            onAction: () => setDeleting([row]),
          },
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => setDeleting(selected),
          },
        ]}
      />
      {creating && (
        <CreateBackupDialog
          projectId={projectId}
          instanceId={search.instance ?? null}
          onClose={() => setCreating(false)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete backup ${deleting[0]?.name || deleting[0]?.id}?`
            : `Delete ${deleting.length} backups?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>Incremental backups that depend on it become unusable.</p>
      </ConfirmDialog>
    </>
  );
}

export function DbBackupDetailPage() {
  const projectId = useProjectId();
  const { backupId } = dbBackupRoute.useParams();
  const navigate = useNavigate();
  const backup = useQuery(dbBackupQuery(projectId, backupId));
  const remove = useDeleteBackup(projectId);
  const [deleting, setDeleting] = useState(false);
  const data = backup.data;
  const duration =
    data?.created && data.updated
      ? Math.max(
          0,
          Math.round(
            (Date.parse(data.updated) - Date.parse(data.created)) / 1000,
          ),
        )
      : null;
  return (
    <>
      <PageHeader
        title={data?.name || data?.id || "Database backup"}
        crumbs={[
          { label: "Project" },
          { label: "Database" },
          { label: "Backups", href: "/databases/backups" },
        ]}
        actions={
          data ? (
            <div className={styles.actions}>
              <Button
                variant="secondary"
                size="sm"
                onPress={() =>
                  void navigate({
                    to: "/databases/instances/new",
                    search: { backup: data.id },
                  })
                }
                isDisabled={!data.can_restore}
              >
                Restore
              </Button>
              <Button
                variant="secondary"
                tone="danger"
                size="sm"
                onPress={() => setDeleting(true)}
              >
                Delete
              </Button>
            </div>
          ) : null
        }
      />
      {backup.isPending ? (
        <SkeletonLines lines={8} />
      ) : backup.isError ? (
        <ErrorState error={backup.error} onRetry={() => backup.refetch()} />
      ) : data ? (
        <div className={styles.grid}>
          <Panel title="Information" headingLevel={2}>
            <KeyValueList
              items={[
                {
                  label: "Status",
                  value: (
                    <StatusPill tone={statusTone(data.status_kind)}>
                      {statusLabel(data.status)}
                    </StatusPill>
                  ),
                },
                { label: "Description", value: data.description || "-" },
                {
                  label: "Datastore",
                  value: `${data.datastore ?? "-"} ${data.datastore_version ?? ""}`,
                },
                {
                  label: "Backup file",
                  value: data.location ? (
                    <code className={styles.mono}>{data.location}</code>
                  ) : (
                    "-"
                  ),
                },
                {
                  label: "Initial volume size",
                  value: data.size === null ? "-" : `${data.size} GB`,
                },
                {
                  label: "Created",
                  value: formatDateTime(data.created) || "-",
                },
                {
                  label: "Updated",
                  value: formatDateTime(data.updated) || "-",
                },
                {
                  label: "Duration",
                  value: duration === null ? "-" : `${duration} seconds`,
                },
                { label: "ID", value: <code>{data.id}</code> },
              ]}
            />
          </Panel>
          <Panel title="Database" headingLevel={2}>
            <KeyValueList
              items={[
                {
                  label: "Instance",
                  value: data.instance_id ? (
                    <RouteLink
                      to="/databases/instances/$instanceId"
                      params={{ instanceId: data.instance_id }}
                    >
                      {data.instance_name || data.instance_id}
                    </RouteLink>
                  ) : (
                    "-"
                  ),
                },
                {
                  label: "Instance status",
                  value: data.instance_status
                    ? statusLabel(data.instance_status)
                    : "-",
                },
                {
                  label: "Parent backup",
                  value: data.parent_id ? (
                    <RouteLink
                      to="/databases/backups/$backupId"
                      params={{ backupId: data.parent_id }}
                    >
                      {data.parent_name || data.parent_id}
                    </RouteLink>
                  ) : (
                    "None (full backup)"
                  ),
                },
              ]}
            />
          </Panel>
        </div>
      ) : null}
      <ConfirmDialog
        isOpen={deleting}
        onOpenChange={setDeleting}
        title={`Delete backup ${data?.name || data?.id}?`}
        confirmLabel="Delete"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(backupId, {
            onSuccess: () => {
              notify.success(`Deleting backup ${data?.name || data?.id}.`);
              void navigate({ to: "/databases/backups" });
            },
          })
        }
      >
        <p>Incremental backups that depend on it become unusable.</p>
      </ConfirmDialog>
    </>
  );
}
