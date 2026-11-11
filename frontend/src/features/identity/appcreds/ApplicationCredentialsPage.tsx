// Application Credentials (Horizon identity/application_credentials):
// list, create with the Nectar three-month expiry prefilled, show the
// secret once, delete.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import type {
  ApplicationCredential,
  ApplicationCredentialCreated,
} from "../../../lib/api/types/identity";
import { formatDateTime } from "../../../lib/format";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { appCredentialsQuery } from "../api";
import { useApplicationCredentialActions } from "./ApplicationCredentialActions";
import { CreateApplicationCredentialDialog } from "./dialogs/CreateApplicationCredentialDialog";
import { SecretDialog } from "./dialogs/SecretDialog";
import styles from "./ApplicationCredentialsPage.module.scss";

const appCredentialsRoute = getRouteApi(
  "/app/identity/application-credentials",
);

/**
 * The user's application credentials with create and delete; a new
 * credential's secret is shown once, right after it is created.
 */
export function ApplicationCredentialsPage() {
  const credentials = useQuery(appCredentialsQuery);
  const search = useListSearch(appCredentialsRoute);
  const table = useQueryTable(credentials, {
    noun: "application credentials",
    search,
    placeholder: "Search application credentials",
  });
  const [created, setCreated] = useState<ApplicationCredentialCreated | null>(
    null,
  );
  const remove = useApplicationCredentialActions();
  const creating = search.params.create === true;
  const setCreating = (create: boolean) => search.patch({ create });

  const columns = useMemo<ColumnDef<ApplicationCredential>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/identity/application-credentials/$credentialId"
            params={{ credentialId: row.id }}
          >
            {row.name}
          </AppLink>
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

  return (
    <>
      <PageHeader
        title="Application credentials"
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
        getRowId={(row) => row.id}
        {...table}
        {...remove.tableProps}
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={remove.rowActions}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => remove.run("delete", selected),
          },
        ]}
      />
      {creating && (
        <CreateApplicationCredentialDialog
          onClose={() => setCreating(false)}
          onCreated={setCreated}
        />
      )}
      {created && (
        <SecretDialog credential={created} onClose={() => setCreated(null)} />
      )}
      {remove.dialogs}
    </>
  );
}
