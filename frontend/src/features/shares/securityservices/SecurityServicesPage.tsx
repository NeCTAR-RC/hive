// Security services (manila-ui security_services panel): the directory
// services shares can authenticate against, with create, edit and delete.
import { useMemo, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import type { SecurityService } from "../../../lib/api/types/shares";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import {
  deleteSecurityService,
  securityServicesQuery,
  shareWriteKeys,
} from "../api";
import { CreateSecurityServiceDialog } from "./dialogs/CreateSecurityServiceDialog";
import { EditSecurityServiceDialog } from "./dialogs/EditSecurityServiceDialog";
import styles from "../Shares.module.scss";

const securityServicesRoute = getRouteApi("/app/shares/security-services");

/** The form dialog open on the security services page, if any. */
type Dialog =
  { kind: "create" } | { kind: "edit"; service: SecurityService } | null;

/**
 * The project's security services, created, edited and deleted here. The
 * page says what they are for, since the share networks that use them are
 * hidden (as Nectar's Horizon hides them).
 */
export function SecurityServicesPage() {
  const projectId = useProjectId();
  const services = useQuery(securityServicesQuery(projectId));
  const search = useListSearch(securityServicesRoute);
  const table = useQueryTable(services, {
    noun: "security services",
    search,
    placeholder: "Search security services",
  });
  const [dialog, setDialog] = useState<Dialog>(null);
  const remove = useBulkAction<SecurityService, "delete">({
    noun: { one: "security service", many: "security services" },
    name: (service) => service.name || service.id,
    getId: (service) => service.id,
    invalidates: shareWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (service) => deleteSecurityService(service.id),
        body: (
          <p>Share networks using the service lose their directory settings.</p>
        ),
      },
    },
  });

  const columns = useMemo<ColumnDef<SecurityService>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/shares/security-services/$serviceId"
            params={{ serviceId: row.id }}
          >
            {row.name || row.id}
          </AppLink>
        ),
        sortValue: (row) => row.name ?? row.id,
        textValue: (row) =>
          `${row.name ?? ""} ${row.domain ?? ""} ${row.server ?? ""} ${row.type_label ?? ""}`,
      },
      {
        id: "type",
        label: "Type",
        cell: (row) => row.type_label ?? "",
        sortValue: (row) => row.type ?? "",
      },
      {
        id: "domain",
        label: "Domain",
        cell: (row) => row.domain ?? "",
        hideBelow: "md",
      },
      {
        id: "server",
        label: "Server",
        cell: (row) => row.server ?? "",
        hideBelow: "md",
      },
      {
        id: "dns",
        label: "DNS IP",
        cell: (row) => row.dns_ip ?? "",
        hideBelow: "lg",
      },
      {
        id: "user",
        label: "User",
        cell: (row) => row.user ?? "",
        hideBelow: "lg",
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Security services"
        crumbs={[{ label: "Project" }, { label: "Share" }]}
        actions={
          <Button size="sm" onPress={() => setDialog({ kind: "create" })}>
            Create security service
          </Button>
        }
      >
        <p className={styles.intro}>
          A security service holds the directory settings (Active Directory,
          LDAP or Kerberos) that a share network passes to its shares. Share
          networks are not offered on this cloud, so a security service cannot
          be attached to a share yet.
        </p>
      </PageHeader>
      <DataTable
        id="security-services"
        label="Security services"
        columns={columns}
        getRowId={(row) => row.id}
        {...table}
        {...remove.tableProps}
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "edit",
            label: "Edit security service",
            onAction: () => setDialog({ kind: "edit", service: row }),
          },
          {
            id: "delete",
            label: "Delete security service",
            tone: "danger",
            onAction: () => remove.run("delete", [row]),
          },
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => remove.run("delete", selected),
          },
        ]}
      />
      {dialog?.kind === "create" && (
        <CreateSecurityServiceDialog onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "edit" && (
        <EditSecurityServiceDialog
          service={dialog.service}
          onClose={() => setDialog(null)}
        />
      )}
      {remove.dialog}
    </>
  );
}
