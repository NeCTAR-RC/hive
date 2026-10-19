// Configuration groups (trove-dashboard database_configurations panel):
// the list, and one group's values, instances and details.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, TabItem, Tabs } from "@ardc-ui/react";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { filterRows } from "../../components/DataTable/filter";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { RouteLink } from "../../components/RouteLink/RouteLink";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import type {
  DbConfiguration,
  DbConfigurationDetail,
} from "../../lib/api/types";
import { formatDateTime } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { dbConfigurationRoute } from "../../app/router";
import {
  dbConfigurationQuery,
  dbConfigurationsQuery,
  useDeleteConfiguration,
  useDetachConfiguration,
  useSetConfigurationValues,
} from "./api";
import {
  AddParameterDialog,
  CreateConfigurationDialog,
} from "./ConfigurationDialogs";
import styles from "./Databases.module.scss";

export function DbConfigurationsPage() {
  const projectId = useProjectId();
  const configurations = useQuery(dbConfigurationsQuery(projectId));
  const remove = useDeleteConfiguration(projectId);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<DbConfiguration[]>([]);

  const columns = useMemo<ColumnDef<DbConfiguration>[]>(
    () => [
      {
        id: "name",
        label: "Configuration group name",
        isRowHeader: true,
        cell: (row) => (
          <RouteLink
            to="/databases/configuration-groups/$configurationId"
            params={{ configurationId: row.id }}
          >
            {row.name || row.id}
          </RouteLink>
        ),
        sortValue: (row) => row.name ?? row.id,
        textValue: (row) =>
          `${row.name ?? ""} ${row.id} ${row.description ?? ""} ${row.datastore ?? ""}`,
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => row.description ?? "",
        hideBelow: "lg",
      },
      {
        id: "datastore",
        label: "Datastore",
        cell: (row) => row.datastore ?? "",
        sortValue: (row) => row.datastore ?? "",
      },
      {
        id: "version",
        label: "Datastore version",
        cell: (row) => row.datastore_version ?? "",
        hideBelow: "md",
      },
    ],
    [],
  );
  const rows = useMemo(
    () => filterRows(configurations.data?.items ?? [], query, columns),
    [configurations.data, query, columns],
  );

  const confirmDelete = async () => {
    const results = await Promise.allSettled(
      deleting.map((c) => remove.mutateAsync(c.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        deleting.length === 1
          ? `Deleted configuration group ${deleting[0]?.name || deleting[0]?.id}.`
          : `Deleted ${deleting.length} configuration groups.`,
      );
    } else {
      notify.danger(
        `Could not delete ${failed} of ${deleting.length} configuration groups.`,
      );
    }
    setDeleting([]);
  };

  return (
    <>
      <PageHeader
        title="Configuration Groups"
        crumbs={[{ label: "Project" }, { label: "Database" }]}
        actions={
          <Button size="sm" onPress={() => setCreating(true)}>
            Create configuration group
          </Button>
        }
      />
      <DataTable
        id="db-configurations"
        label="Configuration groups"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={configurations.isPending}
        isFetching={configurations.isFetching}
        error={configurations.error}
        onRetry={() => void configurations.refetch()}
        onRefresh={() => void configurations.refetch()}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search configuration groups",
        }}
        resetKey={query}
        emptyTitle={
          configurations.data?.items.length
            ? "No configuration groups match"
            : "No configuration groups yet"
        }
        emptyBody={
          configurations.data?.items.length === 0 ? (
            <p>
              A configuration group holds datastore settings you can attach to
              instances.
            </p>
          ) : null
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "delete",
            label: "Delete configuration group",
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
        <CreateConfigurationDialog
          projectId={projectId}
          onClose={() => setCreating(false)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete configuration group ${deleting[0]?.name || deleting[0]?.id}?`
            : `Delete ${deleting.length} configuration groups?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>Detach the group from its instances first.</p>
      </ConfirmDialog>
    </>
  );
}

export function DbConfigurationDetailPage() {
  const projectId = useProjectId();
  const { configurationId } = dbConfigurationRoute.useParams();
  const search = dbConfigurationRoute.useSearch();
  const navigate = useNavigate({ from: dbConfigurationRoute.fullPath });
  const configuration = useQuery(
    dbConfigurationQuery(projectId, configurationId),
  );
  const remove = useDeleteConfiguration(projectId);
  const setValues = useSetConfigurationValues(projectId);
  const detach = useDetachConfiguration(projectId);
  const [adding, setAdding] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const tab = search.tab ?? "values";
  const selectTab = (key: React.Key) =>
    void navigate({
      search: key === "values" ? {} : { tab: String(key) },
      replace: true,
    });
  const data = configuration.data;

  const valueColumns = useMemo<ColumnDef<{ name: string; value: string }>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => <code>{row.name}</code>,
        sortValue: (row) => row.name,
      },
      {
        id: "value",
        label: "Value",
        cell: (row) => <code className={styles.mono}>{row.value}</code>,
      },
    ],
    [],
  );
  const values = data?.values;
  const valueRows = useMemo(
    () =>
      Object.entries(values ?? {}).map(([name, value]) => ({
        name,
        value: typeof value === "string" ? value : JSON.stringify(value),
      })),
    [values],
  );

  const removeValue = (key: string) => {
    if (!data) return;
    const rest = Object.fromEntries(
      Object.entries(data.values)
        .filter(([k]) => k !== key)
        .map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
    );
    setValues.mutate(
      { id: data.id, values: rest },
      {
        onSuccess: () => {
          notify.success(`Removed parameter ${key}.`);
          setRemovingKey(null);
        },
      },
    );
  };

  return (
    <>
      <PageHeader
        title={data?.name || data?.id || "Configuration group"}
        crumbs={[
          { label: "Project" },
          { label: "Database" },
          {
            label: "Configuration Groups",
            href: "/databases/configuration-groups",
          },
        ]}
        actions={
          data ? (
            <Button
              variant="secondary"
              tone="danger"
              size="sm"
              onPress={() => setDeleting(true)}
            >
              Delete
            </Button>
          ) : null
        }
      />
      {configuration.isError ? (
        <ErrorState
          error={configuration.error}
          onRetry={() => configuration.refetch()}
        />
      ) : (
        <Tabs
          selectedKey={tab}
          onSelectionChange={selectTab}
          aria-label="Configuration group details"
        >
          <TabItem id="values" title="Values">
            <DataTable
              id="db-configuration-values"
              label="Configuration values"
              columns={valueColumns}
              rows={data ? valueRows : undefined}
              getRowId={(row) => row.name}
              isLoading={configuration.isPending}
              isFetching={configuration.isFetching}
              onRefresh={() => void configuration.refetch()}
              toolbarActions={
                <Button
                  size="xs"
                  onPress={() => setAdding(true)}
                  isDisabled={!data}
                >
                  Add parameter
                </Button>
              }
              emptyTitle="No parameters set"
              emptyBody={
                <p>Add a parameter to override the datastore default.</p>
              }
              defaultSort={{ column: "name", direction: "ascending" }}
              rowActions={(row) => [
                {
                  id: "delete",
                  label: "Delete parameter",
                  tone: "danger",
                  onAction: () => setRemovingKey(row.name),
                },
              ]}
            />
          </TabItem>
          <TabItem id="instances" title="Instances">
            {data ? (
              <Instances
                configuration={data}
                onDetach={(id) =>
                  detach.mutate(id, {
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
              <SkeletonLines lines={3} />
            )}
          </TabItem>
          <TabItem id="details" title="Details">
            {data ? (
              <Panel title="Details" headingLevel={3}>
                <KeyValueList
                  items={[
                    { label: "Name", value: data.name ?? "-" },
                    { label: "Description", value: data.description || "-" },
                    {
                      label: "Datastore",
                      value: `${data.datastore ?? "-"} ${data.datastore_version ?? ""}`,
                    },
                    {
                      label: "Created",
                      value: formatDateTime(data.created) || "-",
                    },
                    {
                      label: "Updated",
                      value: formatDateTime(data.updated) || "-",
                    },
                    { label: "ID", value: <code>{data.id}</code> },
                  ]}
                />
              </Panel>
            ) : (
              <SkeletonLines lines={6} />
            )}
          </TabItem>
        </Tabs>
      )}
      {data && adding && (
        <AddParameterDialog
          projectId={projectId}
          configuration={data}
          onClose={() => setAdding(false)}
        />
      )}
      <ConfirmDialog
        isOpen={removingKey !== null}
        onOpenChange={(open) => !open && setRemovingKey(null)}
        title={`Remove parameter ${removingKey}?`}
        confirmLabel="Remove"
        isPending={setValues.isPending}
        error={setValues.error}
        onConfirm={() => removingKey && removeValue(removingKey)}
      >
        <p>Instances using the group return to the datastore default for it.</p>
      </ConfirmDialog>
      <ConfirmDialog
        isOpen={deleting}
        onOpenChange={setDeleting}
        title={`Delete configuration group ${data?.name || data?.id}?`}
        confirmLabel="Delete"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(configurationId, {
            onSuccess: () => {
              notify.success(
                `Deleted configuration group ${data?.name || data?.id}.`,
              );
              void navigate({ to: "/databases/configuration-groups" });
            },
          })
        }
      >
        <p>Detach the group from its instances first.</p>
      </ConfirmDialog>
    </>
  );
}

function Instances({
  configuration,
  onDetach,
}: {
  configuration: DbConfigurationDetail;
  onDetach: (id: string) => void;
}) {
  const columns = useMemo<ColumnDef<{ id: string; name: string | null }>[]>(
    () => [
      {
        id: "name",
        label: "Name",
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
      },
    ],
    [],
  );
  return (
    <DataTable
      id="db-configuration-instances"
      label="Instances using this group"
      columns={columns}
      rows={configuration.instances}
      getRowId={(row) => row.id}
      isLoading={false}
      emptyTitle="No instances use this group"
      rowActions={(row) => [
        {
          id: "detach",
          label: "Detach configuration group",
          onAction: () => onDetach(row.id),
        },
      ]}
    />
  );
}
