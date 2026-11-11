import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import type { KeyPair } from "../../../lib/api/types/compute";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { deleteKeyPair, keyPairWriteKeys, keyPairsQuery } from "../api";
import { CreateKeyPairDialog } from "./dialogs/CreateKeyPairDialog";
import { ImportKeyPairDialog } from "./dialogs/ImportKeyPairDialog";
import styles from "./KeyPairsPage.module.scss";

const keyPairsRoute = getRouteApi("/app/compute/key-pairs");

/** A key pair's name, which is also its id. */
const getName = (keyPair: KeyPair) => keyPair.name;

export function KeyPairsPage() {
  const projectId = useProjectId();
  const keyPairs = useQuery(keyPairsQuery(projectId));
  const search = useListSearch(keyPairsRoute);
  const table = useQueryTable(keyPairs, {
    noun: "key pairs",
    search,
    placeholder: "Search key pairs",
  });
  const [dialog, setDialog] = useState<"create" | "import" | null>(null);
  const bulk = useBulkAction<KeyPair, "delete">({
    noun: { one: "key pair", many: "key pairs" },
    name: getName,
    getId: getName,
    invalidates: keyPairWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (keyPair) => deleteKeyPair(keyPair.name),
        body: (
          <p>
            Instances already launched with the key keep it. You will not be
            able to launch new instances with it.
          </p>
        ),
      },
    },
  });

  const columns = useMemo<ColumnDef<KeyPair>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/compute/key-pairs/$name"
            params={{ name: row.name }}
          >
            {row.name}
          </AppLink>
        ),
        sortValue: (row) => row.name,
        textValue: (row) => row.name,
      },
      {
        id: "type",
        label: "Type",
        cell: (row) => row.type ?? "",
        sortValue: (row) => row.type ?? "",
        hideBelow: "md",
      },
      {
        id: "fingerprint",
        label: "Fingerprint",
        cell: (row) => (
          <code className={styles.fingerprint}>{row.fingerprint ?? ""}</code>
        ),
        textValue: (row) => row.fingerprint ?? "",
        hideBelow: "md",
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Key pairs"
        crumbs={[{ label: "Project" }, { label: "Compute" }]}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => setDialog("import")}
            >
              Import public key
            </Button>
            <Button size="sm" onPress={() => setDialog("create")}>
              Create key pair
            </Button>
          </>
        }
      />
      <DataTable
        id="keypairs"
        label="Key pairs"
        columns={columns}
        getRowId={getName}
        {...table}
        {...bulk.tableProps}
        emptyBody={
          <p>
            Create a key pair or import your existing public key to log in to
            instances over SSH.
          </p>
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "delete",
            label: "Delete key pair",
            tone: "danger",
            onAction: () => bulk.run("delete", [row]),
          },
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (rows) => bulk.run("delete", rows),
          },
        ]}
      />
      {dialog === "create" && (
        <CreateKeyPairDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "import" && (
        <ImportKeyPairDialog onClose={() => setDialog(null)} />
      )}
      {bulk.dialog}
    </>
  );
}
