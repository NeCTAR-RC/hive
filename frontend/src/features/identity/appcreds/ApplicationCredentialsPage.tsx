// Application Credentials (Horizon identity/application_credentials):
// list, create with the Nectar three-month expiry prefilled, show the
// secret once, delete.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { filterRows } from "../../../components/DataTable/filter";
import type { ApplicationCredential } from "../../../lib/api/types";
import { formatDateTime } from "../../../lib/format";
import { notify } from "../../../lib/notify";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { appCredentialsRoute } from "../../../app/router";
import { appCredentialsQuery, useDeleteAppCredential } from "../api";
import {
  CreateApplicationCredentialDialog,
  SecretDialog,
} from "./ApplicationCredentialDialogs";
import styles from "./ApplicationCredentialsPage.module.scss";
import { RouteLink } from "../../../components/RouteLink/RouteLink";

export function ApplicationCredentialsPage() {
  const projectId = useProjectId();
  const search = appCredentialsRoute.useSearch();
  const navigate = useNavigate({ from: appCredentialsRoute.fullPath });
  const credentials = useQuery(appCredentialsQuery);
  const remove = useDeleteAppCredential();
  const [query, setQuery] = useState("");
  const [created, setCreated] = useState<ApplicationCredential | null>(null);
  const [deleting, setDeleting] = useState<ApplicationCredential[]>([]);
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

  const columns = useMemo<ColumnDef<ApplicationCredential>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouteLink
            to="/identity/application-credentials/$credentialId"
            params={{ credentialId: row.id }}
          >
            {row.name}
          </RouteLink>
        ),
        sortValue: (row) => row.name,
        textValue: (row) => `${row.name} ${row.id}`,
      },
      {
        id: "project",
        label: "Project ID",
        cell: (row) => <code>{row.project_id ?? ""}</code>,
        sortValue: (row) => row.project_id ?? "",
        hideBelow: "lg",
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => row.description ?? "",
        textValue: (row) => row.description ?? "",
        hideBelow: "md",
      },
      {
        id: "expires",
        label: "Expires",
        cell: (row) =>
          row.expires_at ? formatDateTime(row.expires_at) : "Never",
        sortValue: (row) => row.expires_at ?? "9999",
      },
      {
        id: "roles",
        label: "Roles",
        cell: (row) => row.roles.map((r) => r.name).join(", "),
        textValue: (row) => row.roles.map((r) => r.name).join(" "),
        hideBelow: "md",
      },
      {
        id: "id",
        label: "ID",
        cell: (row) => <code>{row.id}</code>,
        hideBelow: "lg",
        defaultHidden: true,
      },
    ],
    [],
  );
  const rows = useMemo(
    () => filterRows(credentials.data?.items ?? [], query, columns),
    [credentials.data, query, columns],
  );

  const confirmDelete = async () => {
    const results = await Promise.allSettled(
      deleting.map((row) => remove.mutateAsync(row.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        deleting.length === 1
          ? `Application credential ${deleting[0]?.name} deleted.`
          : `${deleting.length} application credentials deleted.`,
      );
    } else {
      notify.danger(
        `Could not delete ${failed} of ${deleting.length} application credentials.`,
      );
    }
    setDeleting([]);
  };

  return (
    <>
      <PageHeader
        title="Application Credentials"
        crumbs={[{ label: "Identity" }]}
        actions={
          <Button size="sm" onPress={() => setCreating(true)}>
            Create application credential
          </Button>
        }
      >
        <p className={styles.intro}>
          Application credentials let scripts and services use the API as you
          without your password. Each one is tied to the project it was created
          in and carries a subset of your roles.
        </p>
      </PageHeader>
      <DataTable
        id="application-credentials"
        label="Application credentials"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={credentials.isPending}
        isFetching={credentials.isFetching}
        error={credentials.error}
        onRetry={() => void credentials.refetch()}
        onRefresh={() => void credentials.refetch()}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search application credentials",
        }}
        resetKey={query}
        emptyTitle={
          credentials.data?.items.length
            ? "No application credentials match"
            : "No application credentials yet"
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "delete",
            label: "Delete",
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
      <CreateApplicationCredentialDialog
        projectId={projectId}
        isOpen={creating}
        onOpenChange={setCreating}
        onCreated={setCreated}
      />
      <SecretDialog
        projectId={projectId}
        credential={created}
        onClose={() => setCreated(null)}
      />
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete application credential ${deleting[0]?.name}?`
            : `Delete ${deleting.length} application credentials?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>Anything still using the credential loses access immediately.</p>
      </ConfirmDialog>
    </>
  );
}
