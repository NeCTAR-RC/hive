// One database instance: overview, users, databases, backups and root
// access (trove-dashboard instance detail tabs, Nectar layout).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { Alert, Button, TabItem, Tabs } from "@ardc-ui/react";
import { CodeBlock } from "../../components/CodeBlock/CodeBlock";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { QuotaMeter } from "../../components/QuotaMeter/QuotaMeter";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import type { DbBackup, DbInstanceDetail, DbUser } from "../../lib/api/types";
import { formatDateTime, formatMb } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { dbInstanceRoute } from "../../app/router";
import {
  dbDatabasesQuery,
  dbInstanceBackupsQuery,
  dbInstanceQuery,
  dbRootQuery,
  dbUsersQuery,
  useDeleteBackup,
  useDeleteDatabase,
  useDeleteInstance,
  useDeleteUser,
  useDetachConfiguration,
  useRestartInstance,
} from "./api";
import {
  AttachConfigurationDialog,
  EnableRootDialog,
  ResizeInstanceDialog,
  ResizeVolumeDialog,
  UpdateInstanceDialog,
  UpgradeInstanceDialog,
} from "./InstanceDialogs";
import { CONNECTION_EXAMPLES, statusLabel, statusTone } from "./status";
import {
  CreateDatabaseDialog,
  CreateUserDialog,
  UserAccessDialog,
} from "./UserDialogs";
import styles from "./Databases.module.scss";

type Dialog =
  "update" | "resize_volume" | "resize" | "upgrade" | "attach" | "root" | null;

export function DbInstanceDetailPage() {
  const projectId = useProjectId();
  const { instanceId } = dbInstanceRoute.useParams();
  const search = dbInstanceRoute.useSearch();
  const navigate = useNavigate({ from: dbInstanceRoute.fullPath });
  const instance = useQuery(dbInstanceQuery(projectId, instanceId));
  const remove = useDeleteInstance(projectId);
  const restart = useRestartInstance(projectId);
  const detach = useDetachConfiguration(projectId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleting, setDeleting] = useState(false);
  const tab = search.tab ?? "overview";
  const selectTab = (key: React.Key) =>
    void navigate({
      search: key === "overview" ? {} : { tab: String(key) },
      replace: true,
    });
  const data = instance.data;
  const can = (action: string) => Boolean(data?.actions.includes(action));

  return (
    <>
      <PageHeader
        title={data?.name || data?.id || "Database instance"}
        crumbs={[
          { label: "Project" },
          { label: "Database" },
          { label: "Instances", href: "/databases/instances" },
        ]}
        actions={
          data ? (
            <div className={styles.actions}>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setDialog("update")}
                isDisabled={!can("update")}
              >
                Update
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setDialog("resize_volume")}
                isDisabled={!can("resize_volume")}
              >
                Resize volume
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setDialog("resize")}
                isDisabled={!can("resize")}
              >
                Resize
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setDialog("upgrade")}
                isDisabled={!can("upgrade")}
              >
                Upgrade
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onPress={() =>
                  restart.mutate(data.id, {
                    onSuccess: () =>
                      notify.success(`Restarting ${data.name || data.id}.`),
                    onError: () =>
                      notify.danger("Could not restart the instance."),
                  })
                }
                isDisabled={!can("restart")}
              >
                Restart
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
      {instance.isError ? (
        <ErrorState error={instance.error} onRetry={() => instance.refetch()} />
      ) : (
        <Tabs
          selectedKey={tab}
          onSelectionChange={selectTab}
          aria-label="Database instance details"
        >
          <TabItem id="overview" title="Overview">
            {data ? (
              <Overview
                instance={data}
                onAttach={() => setDialog("attach")}
                onDetach={() =>
                  detach.mutate(data.id, {
                    onSuccess: () =>
                      notify.success("Configuration group detached."),
                    onError: () =>
                      notify.danger(
                        "Could not detach the configuration group.",
                      ),
                  })
                }
              />
            ) : (
              <SkeletonLines lines={10} />
            )}
          </TabItem>
          <TabItem id="users" title="Users">
            <Users projectId={projectId} instanceId={instanceId} />
          </TabItem>
          <TabItem id="databases" title="Databases">
            <Databases projectId={projectId} instanceId={instanceId} />
          </TabItem>
          <TabItem id="backups" title="Backups">
            <Backups projectId={projectId} instanceId={instanceId} />
          </TabItem>
          <TabItem id="root" title="Root access">
            {data ? (
              <Root
                projectId={projectId}
                instance={data}
                onEnable={() => setDialog("root")}
              />
            ) : (
              <SkeletonLines lines={3} />
            )}
          </TabItem>
        </Tabs>
      )}
      {data && dialog === "update" && (
        <UpdateInstanceDialog
          projectId={projectId}
          instance={data}
          onClose={() => setDialog(null)}
        />
      )}
      {data && dialog === "resize_volume" && (
        <ResizeVolumeDialog
          projectId={projectId}
          instance={data}
          onClose={() => setDialog(null)}
        />
      )}
      {data && dialog === "resize" && (
        <ResizeInstanceDialog
          projectId={projectId}
          instance={data}
          onClose={() => setDialog(null)}
        />
      )}
      {data && dialog === "upgrade" && (
        <UpgradeInstanceDialog
          projectId={projectId}
          instance={data}
          onClose={() => setDialog(null)}
        />
      )}
      {data && dialog === "attach" && (
        <AttachConfigurationDialog
          projectId={projectId}
          instance={data}
          onClose={() => setDialog(null)}
        />
      )}
      {data && dialog === "root" && (
        <EnableRootDialog
          projectId={projectId}
          instance={data}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting}
        onOpenChange={setDeleting}
        title={`Delete database instance ${data?.name || data?.id}?`}
        confirmLabel="Delete"
        confirmText={data?.name ?? ""}
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(instanceId, {
            onSuccess: () => {
              notify.success(
                `Deleting database instance ${data?.name || data?.id}.`,
              );
              void navigate({ to: "/databases/instances" });
            },
          })
        }
      >
        <p>The databases and their data are destroyed. Backups are kept.</p>
      </ConfirmDialog>
    </>
  );
}

function Overview({
  instance,
  onAttach,
  onDetach,
}: {
  instance: DbInstanceDetail;
  onAttach: () => void;
  onDetach: () => void;
}) {
  const host = instance.hostname ?? instance.addresses[0] ?? "<host>";
  const example = CONNECTION_EXAMPLES[(instance.datastore ?? "").toLowerCase()];
  const configuration = instance.configuration;
  return (
    <div className={styles.grid}>
      {instance.fault?.message && (
        <Alert tone="danger" role="status">
          {instance.fault.message}
          {instance.fault.details ? ` ${instance.fault.details}` : ""}
        </Alert>
      )}
      {instance.cidr_warning && (
        <Alert tone="warning" role="status">
          {instance.cidr_warning}
        </Alert>
      )}
      <Panel title="Details" headingLevel={3}>
        <KeyValueList
          items={[
            {
              label: "Status",
              value: (
                <StatusPill tone={statusTone(instance.status_kind)}>
                  {statusLabel(instance.status)}
                </StatusPill>
              ),
            },
            {
              label: "Datastore",
              value: `${instance.datastore ?? "-"} ${instance.datastore_version ?? ""}`,
            },
            {
              label: "Configuration group",
              value: configuration ? (
                <span>
                  <RouterLink
                    to="/databases/configuration-groups/$configurationId"
                    params={{ configurationId: configuration.id }}
                  >
                    {("name" in configuration && configuration.name) ||
                      configuration.id}
                  </RouterLink>{" "}
                  <Button
                    variant="link"
                    size="xs"
                    onPress={onDetach}
                    isDisabled={
                      !instance.actions.includes("detach_configuration")
                    }
                  >
                    Detach
                  </Button>
                </span>
              ) : (
                <span>
                  None{" "}
                  <Button
                    variant="link"
                    size="xs"
                    onPress={onAttach}
                    isDisabled={
                      !instance.actions.includes("attach_configuration")
                    }
                  >
                    Attach
                  </Button>
                </span>
              ),
            },
            {
              label: "Availability zone",
              value: instance.availability_zone ?? "-",
            },
            {
              label: "Created",
              value: formatDateTime(instance.created) || "-",
            },
            {
              label: "Updated",
              value: formatDateTime(instance.updated) || "-",
            },
            { label: "ID", value: <code>{instance.id}</code> },
          ]}
        />
      </Panel>
      <Panel title="Specs" headingLevel={3}>
        <KeyValueList
          items={[
            {
              label: "Flavour",
              value: instance.flavor_name ?? instance.flavor_id ?? "-",
            },
            {
              label: "RAM",
              value: instance.ram ? formatMb(instance.ram) : "-",
            },
            {
              label: "Volume size",
              value:
                instance.volume_size === null
                  ? "-"
                  : `${instance.volume_size} GB`,
            },
          ]}
        />
        {instance.volume_size !== null && instance.volume_used !== null && (
          <div className={styles.meters}>
            <QuotaMeter
              label="Volume usage"
              value={Math.round(instance.volume_used * 100) / 100}
              max={instance.volume_size}
              valueText={`${Math.round(instance.volume_used * 100) / 100} of ${instance.volume_size} GB used`}
            />
          </div>
        )}
      </Panel>
      <Panel title="Networking" headingLevel={3}>
        <KeyValueList
          items={[
            {
              label: "Allowed CIDRs",
              value: instance.allowed_cidrs.join(", "),
            },
            {
              label: "Addresses",
              value: instance.addresses_detail.length
                ? instance.addresses_detail
                    .map((a) => `${a.type ?? "address"}: ${a.address ?? ""}`)
                    .join(", ")
                : "-",
            },
            { label: "Host name", value: instance.hostname ?? "-" },
            { label: "Port", value: instance.port ?? "-" },
          ]}
        />
      </Panel>
      {example && (
        <Panel title="Connection" headingLevel={3}>
          <CodeBlock text={example(host)} label="Connection example" wrap />
        </Panel>
      )}
    </div>
  );
}

function Users({
  projectId,
  instanceId,
}: {
  projectId: string;
  instanceId: string;
}) {
  const users = useQuery(dbUsersQuery(projectId, instanceId));
  const remove = useDeleteUser(projectId);
  const [creating, setCreating] = useState(false);
  const [access, setAccess] = useState<DbUser | null>(null);
  const [deleting, setDeleting] = useState<DbUser | null>(null);
  const columns = useMemo<ColumnDef<DbUser>[]>(
    () => [
      {
        id: "name",
        label: "User name",
        isRowHeader: true,
        cell: (row) => row.name ?? "",
        sortValue: (row) => row.name ?? "",
      },
      { id: "host", label: "Allowed host", cell: (row) => row.host },
      {
        id: "databases",
        label: "Databases",
        cell: (row) => row.databases.join(", "),
        hideBelow: "md",
      },
    ],
    [],
  );
  return (
    <>
      <DataTable
        id="db-users"
        label="Users"
        columns={columns}
        rows={users.data?.items}
        getRowId={(row) => `${row.name}@${row.host}`}
        isLoading={users.isPending}
        isFetching={users.isFetching}
        error={users.error}
        onRetry={() => void users.refetch()}
        onRefresh={() => void users.refetch()}
        toolbarActions={
          <Button size="xs" onPress={() => setCreating(true)}>
            Create user
          </Button>
        }
        emptyTitle="No users"
        rowActions={(row) => [
          {
            id: "access",
            label: "Manage access",
            onAction: () => setAccess(row),
          },
          {
            id: "delete",
            label: "Delete user",
            tone: "danger",
            onAction: () => setDeleting(row),
          },
        ]}
      />
      {creating && (
        <CreateUserDialog
          projectId={projectId}
          instanceId={instanceId}
          onClose={() => setCreating(false)}
        />
      )}
      {access && (
        <UserAccessDialog
          projectId={projectId}
          instanceId={instanceId}
          user={access}
          onClose={() => setAccess(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete user ${deleting?.name}?`}
        confirmLabel="Delete"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(
            { instanceId, name: deleting.name ?? "", host: deleting.host },
            {
              onSuccess: () => {
                notify.success(`Deleted user ${deleting.name}.`);
                setDeleting(null);
              },
            },
          );
        }}
      >
        <p>Applications using this user lose access.</p>
      </ConfirmDialog>
    </>
  );
}

function Databases({
  projectId,
  instanceId,
}: {
  projectId: string;
  instanceId: string;
}) {
  const databases = useQuery(dbDatabasesQuery(projectId, instanceId));
  const remove = useDeleteDatabase(projectId);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const columns = useMemo<ColumnDef<{ name: string | null }>[]>(
    () => [
      {
        id: "name",
        label: "Database name",
        isRowHeader: true,
        cell: (row) => row.name ?? "",
        sortValue: (row) => row.name ?? "",
      },
    ],
    [],
  );
  return (
    <>
      <DataTable
        id="db-databases"
        label="Databases"
        columns={columns}
        rows={databases.data?.items}
        getRowId={(row) => row.name ?? ""}
        isLoading={databases.isPending}
        isFetching={databases.isFetching}
        error={databases.error}
        onRetry={() => void databases.refetch()}
        onRefresh={() => void databases.refetch()}
        toolbarActions={
          <Button size="xs" onPress={() => setCreating(true)}>
            Create database
          </Button>
        }
        emptyTitle="No databases"
        rowActions={(row) => [
          {
            id: "delete",
            label: "Delete database",
            tone: "danger",
            onAction: () => setDeleting(row.name ?? ""),
          },
        ]}
      />
      {creating && (
        <CreateDatabaseDialog
          projectId={projectId}
          instanceId={instanceId}
          onClose={() => setCreating(false)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete database ${deleting}?`}
        confirmLabel="Delete"
        confirmText={deleting ?? ""}
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() => {
          if (deleting === null) return;
          remove.mutate(
            { instanceId, name: deleting },
            {
              onSuccess: () => {
                notify.success(`Deleted database ${deleting}.`);
                setDeleting(null);
              },
            },
          );
        }}
      >
        <p>All data in the database is lost. This cannot be undone.</p>
      </ConfirmDialog>
    </>
  );
}

function Backups({
  projectId,
  instanceId,
}: {
  projectId: string;
  instanceId: string;
}) {
  const navigate = useNavigate();
  const backups = useQuery(dbInstanceBackupsQuery(projectId, instanceId));
  const remove = useDeleteBackup(projectId);
  const [deleting, setDeleting] = useState<DbBackup | null>(null);
  const columns = useMemo<ColumnDef<DbBackup>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/databases/backups/$backupId"
            params={{ backupId: row.id }}
            className={styles.nameLink}
          >
            {row.name || row.id}
          </RouterLink>
        ),
        sortValue: (row) => row.name ?? row.id,
      },
      {
        id: "created",
        label: "Created",
        cell: (row) => formatDateTime(row.created) || "",
        sortValue: (row) => row.created ?? "",
      },
      {
        id: "incremental",
        label: "Incremental",
        cell: (row) => (row.incremental ? "Yes" : "No"),
        hideBelow: "md",
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
  return (
    <>
      <DataTable
        id="db-instance-backups"
        label="Backups"
        columns={columns}
        rows={backups.data?.items}
        getRowId={(row) => row.id}
        isLoading={backups.isPending}
        isFetching={backups.isFetching}
        error={backups.error}
        onRetry={() => void backups.refetch()}
        onRefresh={() => void backups.refetch()}
        toolbarActions={
          <Button
            size="xs"
            onPress={() =>
              void navigate({
                to: "/databases/backups",
                search: { create: true, instance: instanceId },
              })
            }
          >
            Create backup
          </Button>
        }
        emptyTitle="No backups of this instance"
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
            onAction: () => setDeleting(row),
          },
        ]}
      />
      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete backup ${deleting?.name || deleting?.id}?`}
        confirmLabel="Delete"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              notify.success(
                `Deleting backup ${deleting.name || deleting.id}.`,
              );
              setDeleting(null);
            },
          });
        }}
      >
        <p>Incremental backups that depend on it become unusable.</p>
      </ConfirmDialog>
    </>
  );
}

function Root({
  projectId,
  instance,
  onEnable,
}: {
  projectId: string;
  instance: DbInstanceDetail;
  onEnable: () => void;
}) {
  const root = useQuery(dbRootQuery(projectId, instance.id));
  return (
    <Panel title="Root access" headingLevel={3}>
      {root.isPending ? (
        <SkeletonLines lines={2} />
      ) : root.isError ? (
        <ErrorState error={root.error} onRetry={() => root.refetch()} />
      ) : (
        <div className={styles.stack}>
          <KeyValueList
            items={[
              { label: "Instance", value: instance.name || instance.id },
              {
                label: "Has root ever been enabled",
                value: root.data?.root_enabled ? "Yes" : "No",
              },
            ]}
          />
          <div>
            <Button
              size="sm"
              onPress={onEnable}
              isDisabled={!instance.actions.includes("root")}
            >
              {root.data?.root_enabled ? "Reset root password" : "Enable root"}
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
