// Database instances (trove-dashboard databases panel, Nectar columns):
// the project's instances with quota and the row actions.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { filterRows } from "../../components/DataTable/filter";
import { QuotaMeter } from "../../components/QuotaMeter/QuotaMeter";
import { RouteLink } from "../../components/RouteLink/RouteLink";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import type { DbInstance } from "../../lib/api/types";
import { formatMb } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import {
  dbInstancesQuery,
  useDeleteInstance,
  useDetachConfiguration,
  useRestartInstance,
} from "./api";
import {
  AttachConfigurationDialog,
  ResizeInstanceDialog,
  ResizeVolumeDialog,
  UpdateInstanceDialog,
  UpgradeInstanceDialog,
} from "./InstanceDialogs";
import { quotaLimit, statusLabel, statusTone } from "./status";
import styles from "./Databases.module.scss";

type Dialog = {
  kind: "update" | "resize_volume" | "resize" | "upgrade" | "attach";
  instance: DbInstance;
} | null;

export function DbInstancesPage() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const instances = useQuery(dbInstancesQuery(projectId));
  const remove = useDeleteInstance(projectId);
  const restart = useRestartInstance(projectId);
  const detach = useDetachConfiguration(projectId);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleting, setDeleting] = useState<DbInstance[]>([]);

  const columns = useMemo<ColumnDef<DbInstance>[]>(
    () => [
      {
        id: "name",
        label: "Instance name",
        isRowHeader: true,
        cell: (row) => (
          <RouteLink
            to="/databases/instances/$instanceId"
            params={{ instanceId: row.id }}
          >
            {row.name || row.id}
          </RouteLink>
        ),
        sortValue: (row) => row.name ?? row.id,
        textValue: (row) =>
          `${row.name ?? ""} ${row.id} ${row.datastore ?? ""} ${row.addresses.join(" ")}`,
      },
      {
        id: "datastore",
        label: "Datastore",
        cell: (row) => row.datastore ?? "",
        sortValue: (row) => row.datastore ?? "",
        hideBelow: "md",
      },
      {
        id: "version",
        label: "Datastore version",
        cell: (row) => row.datastore_version ?? "",
        hideBelow: "lg",
      },
      {
        id: "host",
        label: "Host",
        cell: (row) =>
          row.hostname ??
          (row.addresses.length ? row.addresses.join(", ") : "Not assigned"),
        hideBelow: "md",
      },
      {
        id: "size",
        label: "Size",
        cell: (row) =>
          row.flavor_name
            ? `${row.flavor_name}${row.ram ? ` | ${formatMb(row.ram)}` : ""}`
            : "",
        hideBelow: "lg",
      },
      {
        id: "volume",
        label: "Volume size",
        cell: (row) =>
          row.volume_size === null ? "" : `${row.volume_size} GB`,
        sortValue: (row) => row.volume_size ?? 0,
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
    () => filterRows(instances.data?.items ?? [], query, columns),
    [instances.data, query, columns],
  );
  const quota = instances.data?.quota;
  const count = instances.data?.items.length ?? 0;

  // Horizon skips rows that cannot restart; one toast for the batch.
  const restartMany = async (selected: DbInstance[]) => {
    const eligible = selected.filter((i) => i.actions.includes("restart"));
    const results = await Promise.allSettled(
      eligible.map((i) => restart.mutateAsync(i.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        eligible.length === 1
          ? `Restarting ${eligible[0]?.name || eligible[0]?.id}.`
          : `Restarting ${eligible.length} instances.`,
      );
    } else {
      notify.danger(
        `Could not restart ${failed} of ${eligible.length} instances.`,
      );
    }
  };

  const confirmDelete = async () => {
    const results = await Promise.allSettled(
      deleting.map((i) => remove.mutateAsync(i.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        deleting.length === 1
          ? `Deleting database instance ${deleting[0]?.name || deleting[0]?.id}.`
          : `Deleting ${deleting.length} database instances.`,
      );
    } else {
      notify.danger(
        `Could not delete ${failed} of ${deleting.length} instances.`,
      );
    }
    setDeleting([]);
  };
  const gate = (row: DbInstance, action: string, reason: string) => ({
    isDisabled: !row.actions.includes(action),
    disabledReason: reason,
  });

  return (
    <>
      <PageHeader
        title="Database Instances"
        crumbs={[{ label: "Project" }, { label: "Database" }]}
        actions={
          <RouteLink variant="primary" size="sm" to="/databases/instances/new">
            Launch instance
          </RouteLink>
        }
      >
        {quota && quota.max_instances !== null && (
          <div className={styles.meters}>
            <QuotaMeter
              label="Instances"
              value={count}
              max={quota.max_instances}
              valueText={`${count} of ${quotaLimit(quota.max_instances).toLowerCase()} instances`}
            />
          </div>
        )}
      </PageHeader>
      <DataTable
        id="db-instances"
        label="Database instances"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={instances.isPending}
        isFetching={instances.isFetching}
        error={instances.error}
        onRetry={() => void instances.refetch()}
        onRefresh={() => void instances.refetch()}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search instances",
        }}
        resetKey={query}
        emptyTitle={
          instances.data?.items.length
            ? "No instances match"
            : "No database instances yet"
        }
        emptyBody={
          instances.data?.items.length === 0 ? (
            <p>Launch a managed MySQL or PostgreSQL instance.</p>
          ) : null
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "backup",
            label: "Create backup",
            ...gate(
              row,
              "backup",
              "Backups can be taken once the instance is active.",
            ),
            onAction: () =>
              void navigate({
                to: "/databases/backups",
                search: { create: true, instance: row.id },
              }),
          },
          {
            id: "update",
            label: "Update instance",
            ...gate(
              row,
              "update",
              "The instance can be updated once it is active.",
            ),
            onAction: () => setDialog({ kind: "update", instance: row }),
          },
          {
            id: "resize_volume",
            label: "Resize volume",
            ...gate(
              row,
              "resize_volume",
              "The volume can be resized once the instance is active.",
            ),
            onAction: () => setDialog({ kind: "resize_volume", instance: row }),
          },
          {
            id: "resize",
            label: "Resize instance",
            ...gate(
              row,
              "resize",
              "The instance can be resized once it is active or shut off.",
            ),
            onAction: () => setDialog({ kind: "resize", instance: row }),
          },
          {
            id: "upgrade",
            label: "Upgrade instance",
            ...gate(
              row,
              "upgrade",
              "The instance can be upgraded once it is active or shut off.",
            ),
            onAction: () => setDialog({ kind: "upgrade", instance: row }),
          },
          row.actions.includes("detach_configuration")
            ? {
                id: "detach",
                label: "Detach configuration group",
                onAction: () =>
                  detach.mutate(row.id, {
                    onSuccess: () =>
                      notify.success("Configuration group detached."),
                    onError: () =>
                      notify.danger(
                        "Could not detach the configuration group.",
                      ),
                  }),
              }
            : {
                id: "attach",
                label: "Attach configuration group",
                ...gate(
                  row,
                  "attach_configuration",
                  "The instance must be active.",
                ),
                onAction: () => setDialog({ kind: "attach", instance: row }),
              },
          {
            id: "root",
            label: "Manage root access",
            ...gate(
              row,
              "root",
              "Root access can be managed once the instance is active.",
            ),
            onAction: () =>
              void navigate({
                to: "/databases/instances/$instanceId",
                params: { instanceId: row.id },
                search: { tab: "root" },
              }),
          },
          {
            id: "restart",
            label: "Restart instance",
            ...gate(
              row,
              "restart",
              "The instance cannot be restarted right now.",
            ),
            onAction: () =>
              restart.mutate(row.id, {
                onSuccess: () =>
                  notify.success(`Restarting ${row.name || row.id}.`),
                onError: () =>
                  notify.danger(`Could not restart ${row.name || row.id}.`),
              }),
          },
          {
            id: "delete",
            label: "Delete instance",
            tone: "danger",
            onAction: () => setDeleting([row]),
          },
        ]}
        batchActions={[
          {
            id: "restart",
            label: "Restart",
            isDisabled: (selected) =>
              selected.every((i) => !i.actions.includes("restart")),
            onAction: (selected) => void restartMany(selected),
          },
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => setDeleting(selected),
          },
        ]}
      />
      {dialog?.kind === "update" && (
        <UpdateInstanceDialog
          projectId={projectId}
          instance={dialog.instance}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "resize_volume" && (
        <ResizeVolumeDialog
          projectId={projectId}
          instance={dialog.instance}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "resize" && (
        <ResizeInstanceDialog
          projectId={projectId}
          instance={dialog.instance}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "upgrade" && (
        <UpgradeInstanceDialog
          projectId={projectId}
          instance={dialog.instance}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "attach" && (
        <AttachConfigurationDialog
          projectId={projectId}
          instance={dialog.instance}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete database instance ${deleting[0]?.name || deleting[0]?.id}?`
            : `Delete ${deleting.length} database instances?`
        }
        confirmLabel="Delete"
        confirmText={deleting.length === 1 ? (deleting[0]?.name ?? "") : ""}
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>The databases and their data are destroyed. Backups are kept.</p>
      </ConfirmDialog>
    </>
  );
}
