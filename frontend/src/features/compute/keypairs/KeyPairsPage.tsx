import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { filterRows } from "../../../components/DataTable/filter";
import type { KeyPair } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { keyPairsQuery, useDeleteKeyPair } from "../api";
import { CreateKeyPairDialog, ImportKeyPairDialog } from "./KeyPairDialogs";
import styles from "./KeyPairsPage.module.scss";

export function KeyPairsPage() {
  const projectId = useProjectId();
  const keyPairs = useQuery(keyPairsQuery(projectId));
  const remove = useDeleteKeyPair(projectId);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"create" | "import" | null>(null);
  const [deleting, setDeleting] = useState<KeyPair[]>([]);

  const columns = useMemo<ColumnDef<KeyPair>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/compute/key-pairs/$name"
            params={{ name: row.name }}
            className={styles.nameLink}
          >
            {row.name}
          </RouterLink>
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
  const rows = useMemo(
    () => filterRows(keyPairs.data?.items ?? [], query, columns),
    [keyPairs.data, query, columns],
  );

  const confirmDelete = async () => {
    const names = deleting.map((k) => k.name);
    const results = await Promise.allSettled(
      names.map((name) => remove.mutateAsync(name)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        names.length === 1
          ? `Key pair ${names[0]} deleted.`
          : `${names.length} key pairs deleted.`,
      );
      setDeleting([]);
    } else {
      notify.danger(`Could not delete ${failed} of ${names.length} key pairs.`);
      setDeleting([]);
    }
  };

  return (
    <>
      <PageHeader
        title="Key Pairs"
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
        rows={rows}
        getRowId={(row) => row.name}
        isLoading={keyPairs.isPending}
        isFetching={keyPairs.isFetching}
        error={keyPairs.error}
        onRetry={() => void keyPairs.refetch()}
        onRefresh={() => void keyPairs.refetch()}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search key pairs",
        }}
        resetKey={query}
        emptyTitle={
          keyPairs.data?.items.length
            ? "No key pairs match"
            : "No key pairs yet"
        }
        emptyBody={
          keyPairs.data?.items.length === 0 ? (
            <p>
              Create a key pair or import your existing public key to log in to
              instances over SSH.
            </p>
          ) : null
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "delete",
            label: "Delete key pair",
            tone: "danger",
            onAction: () => setDeleting([row]),
          },
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (rows) => setDeleting(rows),
          },
        ]}
      />
      <CreateKeyPairDialog
        projectId={projectId}
        isOpen={dialog === "create"}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <ImportKeyPairDialog
        projectId={projectId}
        isOpen={dialog === "import"}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete key pair ${deleting[0]?.name}?`
            : `Delete ${deleting.length} key pairs?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>
          Instances already launched with the key keep it. You will not be able
          to launch new instances with it.
        </p>
      </ConfirmDialog>
    </>
  );
}
