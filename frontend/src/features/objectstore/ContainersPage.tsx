// Containers (Horizon project/containers): the account's containers with
// create and delete, and the account usage.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { filterRows } from "../../components/DataTable/filter";
import type { Container } from "../../lib/api/types";
import { formatBytes, formatNumber } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { containersRoute } from "../../app/router";
import { containersQuery, storeInfoQuery, useDeleteContainer } from "./api";
import { CreateContainerDialog } from "./ObjectStoreDialogs";
import styles from "./ObjectStore.module.scss";

export function ContainersPage() {
  const projectId = useProjectId();
  const search = containersRoute.useSearch();
  const navigate = useNavigate({ from: containersRoute.fullPath });
  const info = useQuery(storeInfoQuery(projectId));
  const containers = useQuery(containersQuery(projectId));
  const remove = useDeleteContainer(projectId);
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<Container | null>(null);
  const creating = search.create === true;
  const setCreating = (open: boolean) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous };
        if (open) next.create = true;
        else delete next.create;
        return next;
      },
      replace: true,
    });

  const columns = useMemo<ColumnDef<Container>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/object-store/containers/$container"
            params={{ container: row.name }}
            className={styles.nameLink}
          >
            {row.name}
          </RouterLink>
        ),
        sortValue: (row) => row.name,
        textValue: (row) => row.name,
      },
      {
        id: "objects",
        label: "Objects",
        cell: (row) => formatNumber(row.object_count),
        sortValue: (row) => row.object_count,
      },
      {
        id: "size",
        label: "Size",
        cell: (row) => formatBytes(row.bytes),
        sortValue: (row) => row.bytes,
      },
    ],
    [],
  );
  const rows = useMemo(
    () => filterRows(containers.data?.items ?? [], query, columns),
    [containers.data, query, columns],
  );

  return (
    <>
      <PageHeader
        title="Containers"
        crumbs={[{ label: "Project" }, { label: "Object Store" }]}
        actions={
          <Button size="sm" onPress={() => setCreating(true)}>
            Create container
          </Button>
        }
      >
        {info.data && (
          <p className={styles.usage}>
            {formatNumber(info.data.account.container_count)}{" "}
            {info.data.account.container_count === 1
              ? "container"
              : "containers"}
            , {formatNumber(info.data.account.object_count)}{" "}
            {info.data.account.object_count === 1 ? "object" : "objects"},{" "}
            {formatBytes(info.data.account.bytes)} used
            {info.data.account.quota_containers
              ? ` (up to ${formatNumber(Number(info.data.account.quota_containers))} containers)`
              : ""}
            .
          </p>
        )}
      </PageHeader>
      <DataTable
        id="containers"
        label="Containers"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.name}
        isLoading={containers.isPending}
        isFetching={containers.isFetching}
        error={containers.error}
        onRetry={() => void containers.refetch()}
        onRefresh={() => void containers.refetch()}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search containers",
        }}
        resetKey={query}
        emptyTitle={
          containers.data?.items.length
            ? "No containers match"
            : "No containers yet"
        }
        emptyBody={
          containers.data?.items.length === 0 ? (
            <p>Create a container to start storing objects.</p>
          ) : null
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "open",
            label: "Open",
            onAction: () =>
              void navigate({
                to: "/object-store/containers/$container",
                params: { container: row.name },
              }),
          },
          {
            id: "delete",
            label: "Delete container",
            tone: "danger",
            isDisabled: row.object_count > 0,
            disabledReason: "Only empty containers can be deleted.",
            onAction: () => setDeleting(row),
          },
        ]}
      />
      <CreateContainerDialog
        projectId={projectId}
        policies={info.data?.policies ?? []}
        isOpen={creating}
        onOpenChange={setCreating}
      />
      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete container ${deleting?.name}?`}
        confirmLabel="Delete"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.name, {
            onSuccess: () => {
              notify.success(`Container ${deleting.name} deleted.`);
              setDeleting(null);
            },
          });
        }}
      >
        <p>The container must be empty. This cannot be undone.</p>
      </ConfirmDialog>
    </>
  );
}
