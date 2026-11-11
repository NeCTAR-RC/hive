// Containers (Horizon project/containers): the account's containers with
// create and delete, and the account usage.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Alert, Button } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { toRowActions } from "../../../lib/actions";
import type { Container } from "../../../lib/api/types/objectstore";
import { formatBytes, formatNumber } from "../../../lib/format";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import {
  containersQuery,
  containerWriteKeys,
  deleteContainer,
  storeInfoQuery,
} from "../api";
import { CreateContainerDialog } from "./dialogs/CreateContainerDialog";
import {
  availableContainerActions,
  containerContents,
  type ContainerActionId,
} from "../status";
import styles from "../ObjectStore.module.scss";

const containersRoute = getRouteApi("/app/object-store/containers");

/** A container's name, which is also its id. */
const getName = (container: Container) => container.name;

/**
 * The containers with create and delete, under the account's usage. A list
 * the backend stopped at its page cap says so, since containers past it
 * are missing from the table.
 */
export function ContainersPage() {
  const projectId = useProjectId();
  const navigate = containersRoute.useNavigate();
  const info = useQuery(storeInfoQuery(projectId));
  const containers = useQuery(containersQuery(projectId));
  const search = useListSearch(containersRoute);
  const table = useQueryTable(containers, {
    noun: "containers",
    search,
    placeholder: "Search containers",
  });
  const remove = useBulkAction<Container, "delete">({
    noun: { one: "container", many: "containers" },
    name: getName,
    getId: getName,
    invalidates: containerWriteKeys(),
    actions: {
      delete: {
        verb: DELETE,
        request: (container) =>
          deleteContainer(container.name, container.object_count > 0),
        title: (items) => {
          const [only] = items;
          if (items.length !== 1 || !only) {
            return `Delete ${items.length} containers?`;
          }
          return only.object_count > 0
            ? `Delete ${only.name} and ${containerContents(only)}?`
            : `Delete container ${only.name}?`;
        },
        body: (items) => (
          <p>
            {items.some((container) => container.object_count > 0)
              ? "Every object in the container is deleted with it. "
              : ""}
            This cannot be undone.
          </p>
        ),
      },
    },
  });
  const creating = search.params.create === true;
  const setCreating = (create: boolean) => search.patch({ create });

  /** Runs one row menu action on `container`. */
  const runAction = (id: ContainerActionId, container: Container) => {
    if (id === "open") {
      void navigate({
        to: "/object-store/containers/$container",
        params: { container: container.name },
      });
    } else {
      remove.run("delete", [container]);
    }
  };

  const columns = useMemo<ColumnDef<Container>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/object-store/containers/$container"
            params={{ container: row.name }}
          >
            {row.name}
          </AppLink>
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

  return (
    <>
      <PageHeader
        title="Containers"
        crumbs={[{ label: "Project" }, { label: "Object store" }]}
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
      {containers.data?.truncated && (
        <Alert tone="info" role="status">
          Only the first {formatNumber(containers.data.items.length)} containers
          are shown; this project has more. Use the OpenStack command line tools
          to reach the rest.
        </Alert>
      )}
      <DataTable
        id="containers"
        label="Containers"
        columns={columns}
        getRowId={getName}
        {...table}
        {...remove.tableProps}
        emptyBody={<p>Create a container to start storing objects.</p>}
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) =>
          toRowActions(availableContainerActions(row), (id) =>
            runAction(id, row),
          )
        }
      />
      {creating && (
        <CreateContainerDialog
          policies={info.data?.policies ?? []}
          onClose={() => setCreating(false)}
        />
      )}
      {remove.dialog}
    </>
  );
}
