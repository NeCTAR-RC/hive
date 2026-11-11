// The Instances tab of a configuration group: the instances using it.
import { useMemo } from "react";
import { AppLink } from "../../../../components/AppLink/AppLink";
import { useBulkAction } from "../../../../components/BulkAction/useBulkAction";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import type { DbConfigurationDetail } from "../../../../lib/api/types/databases";
import { databaseWrites, detachConfiguration } from "../../api";

/** An instance that uses a configuration group. */
interface GroupInstance {
  id: string;
  name: string | null;
}

/** The instances using the group, each of which can be detached from it. */
export function InstancesTab({
  configuration,
}: {
  configuration: DbConfigurationDetail;
}) {
  const detach = useBulkAction<GroupInstance, "detach">({
    noun: { one: "database instance", many: "database instances" },
    name: (instance) => instance.name || instance.id,
    getId: (instance) => instance.id,
    invalidates: databaseWrites.configurationLinks,
    actions: {
      detach: {
        verb: {
          label: "Detach the configuration group from",
          done: "Detached the configuration group from",
          failed: "detach the configuration group from",
        },
        tone: "primary",
        immediate: true,
        request: (instance) => detachConfiguration(instance.id),
      },
    },
  });
  const columns = useMemo<ColumnDef<GroupInstance>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/databases/instances/$instanceId"
            params={{ instanceId: row.id }}
          >
            {row.name || row.id}
          </AppLink>
        ),
        sortValue: (row) => row.name ?? row.id,
      },
    ],
    [],
  );
  return (
    <>
      <DataTable
        id="db-configuration-instances"
        label="Instances using this group"
        columns={columns}
        rows={configuration.instances}
        getRowId={(row) => row.id}
        isLoading={false}
        {...detach.tableProps}
        emptyTitle="No instances use this group"
        rowActions={(row) => [
          {
            id: "detach",
            label: "Detach configuration group",
            onAction: () => detach.run("detach", [row]),
          },
        ]}
      />
      {detach.dialog}
    </>
  );
}
