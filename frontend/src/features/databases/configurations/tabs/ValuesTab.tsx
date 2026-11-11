// The Values tab of a configuration group: its parameters, added one at a
// time and removed in batches.
import { useMemo, useState } from "react";
import { Button } from "@ardc-ui/react";
import { REMOVE } from "../../../../components/BulkAction/messages";
import { useBulkAction } from "../../../../components/BulkAction/useBulkAction";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import type { DbConfigurationDetail } from "../../../../lib/api/types/databases";
import { databaseWrites, setConfigurationValues } from "../../api";
import { AddParameterDialog } from "../dialogs/AddParameterDialog";
import { valueStrings, valuesWithout } from "../values";
import styles from "../../Databases.module.scss";

/** One parameter of a configuration group, as the Values tab lists it. */
interface ValueRow {
  name: string;
  value: string;
}

/**
 * The group's parameters with their values. `isFetching` and `onRefresh`
 * come from the page's query of the group, which the table refreshes.
 */
export function ValuesTab({
  configuration,
  isFetching,
  onRefresh,
}: {
  configuration: DbConfigurationDetail;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const invalidates = useMemo(
    () => databaseWrites.configurationValues(configuration.id),
    [configuration.id],
  );
  const removeValues = useBulkAction<ValueRow, "remove">({
    noun: { one: "parameter", many: "parameters" },
    name: (row) => row.name,
    getId: (row) => row.name,
    invalidates,
    actions: {
      remove: {
        verb: REMOVE,
        body: (
          <p>
            Instances using the group return to the datastore default for it.
          </p>
        ),
        // The values endpoint replaces the whole set, so one request drops
        // every chosen parameter; per-parameter requests would undo each
        // other.
        batch: async (rows) => {
          await setConfigurationValues(
            configuration.id,
            valuesWithout(
              configuration.values,
              rows.map((row) => row.name),
            ),
          );
          return { succeeded: rows, failed: [] };
        },
      },
    },
  });

  const valueColumns = useMemo<ColumnDef<ValueRow>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => <code className={styles.identifier}>{row.name}</code>,
        sortValue: (row) => row.name,
      },
      {
        id: "value",
        label: "Value",
        cell: (row) => <code className={styles.identifier}>{row.value}</code>,
      },
    ],
    [],
  );

  // Rebuilt only when the group's values change, not on every render.
  const rows = useMemo(
    () =>
      Object.entries(valueStrings(configuration.values)).map(
        ([name, value]): ValueRow => ({ name, value }),
      ),
    [configuration.values],
  );

  return (
    <>
      <DataTable
        id="db-configuration-values"
        label="Configuration values"
        columns={valueColumns}
        rows={rows}
        getRowId={(row) => row.name}
        isLoading={false}
        isFetching={isFetching}
        onRefresh={onRefresh}
        {...removeValues.tableProps}
        toolbarActions={
          <Button size="xs" onPress={() => setAdding(true)}>
            Add parameter
          </Button>
        }
        emptyTitle="No parameters set"
        emptyBody={<p>Add a parameter to override the datastore default.</p>}
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "delete",
            label: "Delete parameter",
            tone: "danger",
            onAction: () => removeValues.run("remove", [row]),
          },
        ]}
      />
      {adding && (
        <AddParameterDialog
          configuration={configuration}
          onClose={() => setAdding(false)}
        />
      )}
      {removeValues.dialog}
    </>
  );
}
