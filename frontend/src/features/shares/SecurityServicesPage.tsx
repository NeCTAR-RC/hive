// Security services (manila-ui security_services panel): the directory
// services shares can authenticate against, with create, edit and delete.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { filterRows } from "../../components/DataTable/filter";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import type { SecurityService } from "../../lib/api/types";
import { formatDateTime } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { securityServiceRoute } from "../../app/router";
import {
  securityServiceQuery,
  securityServicesQuery,
  useDeleteSecurityService,
} from "./api";
import {
  CreateSecurityServiceDialog,
  EditSecurityServiceDialog,
} from "./SecurityServiceDialogs";
import styles from "./Shares.module.scss";

export function SecurityServicesPage() {
  const projectId = useProjectId();
  const services = useQuery(securityServicesQuery(projectId));
  const remove = useDeleteSecurityService(projectId);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SecurityService | null>(null);
  const [deleting, setDeleting] = useState<SecurityService[]>([]);

  const columns = useMemo<ColumnDef<SecurityService>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/shares/security-services/$serviceId"
            params={{ serviceId: row.id }}
            className={styles.nameLink}
          >
            {row.name || row.id}
          </RouterLink>
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
  const rows = useMemo(
    () => filterRows(services.data?.items ?? [], query, columns),
    [services.data, query, columns],
  );

  const confirmDelete = async () => {
    const results = await Promise.allSettled(
      deleting.map((s) => remove.mutateAsync(s.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        deleting.length === 1
          ? `Deleted security service ${deleting[0]?.name || deleting[0]?.id}.`
          : `Deleted ${deleting.length} security services.`,
      );
    } else {
      notify.danger(
        `Could not delete ${failed} of ${deleting.length} security services.`,
      );
    }
    setDeleting([]);
  };

  return (
    <>
      <PageHeader
        title="Security Services"
        crumbs={[{ label: "Project" }, { label: "Share" }]}
        actions={
          <Button size="sm" onPress={() => setCreating(true)}>
            Create security service
          </Button>
        }
      />
      <DataTable
        id="security-services"
        label="Security services"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={services.isPending}
        isFetching={services.isFetching}
        error={services.error}
        onRetry={() => void services.refetch()}
        onRefresh={() => void services.refetch()}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search security services",
        }}
        resetKey={query}
        emptyTitle={
          services.data?.items.length
            ? "No security services match"
            : "No security services yet"
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          { id: "edit", label: "Edit", onAction: () => setEditing(row) },
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
      {creating && (
        <CreateSecurityServiceDialog
          projectId={projectId}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <EditSecurityServiceDialog
          projectId={projectId}
          service={editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete security service ${deleting[0]?.name || deleting[0]?.id}?`
            : `Delete ${deleting.length} security services?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>Share networks using the service lose their directory settings.</p>
      </ConfirmDialog>
    </>
  );
}

export function SecurityServiceDetailPage() {
  const projectId = useProjectId();
  const { serviceId } = securityServiceRoute.useParams();
  const service = useQuery(securityServiceQuery(projectId, serviceId));
  const [editing, setEditing] = useState(false);
  const data = service.data;
  return (
    <>
      <PageHeader
        title={data?.name || data?.id || "Security service"}
        crumbs={[
          { label: "Project" },
          { label: "Share" },
          { label: "Security Services", href: "/shares/security-services" },
        ]}
        actions={
          data ? (
            <Button
              variant="secondary"
              size="sm"
              onPress={() => setEditing(true)}
            >
              Edit
            </Button>
          ) : null
        }
      />
      {service.isPending ? (
        <SkeletonLines lines={8} />
      ) : service.isError ? (
        <ErrorState error={service.error} onRetry={() => service.refetch()} />
      ) : data ? (
        <Panel title="Details" headingLevel={2}>
          <KeyValueList
            items={[
              { label: "Type", value: data.type_label ?? "-" },
              { label: "Description", value: data.description || "-" },
              { label: "DNS IP", value: data.dns_ip ?? "-" },
              { label: "Organisational unit", value: data.ou ?? "-" },
              { label: "Server", value: data.server ?? "-" },
              { label: "Domain", value: data.domain ?? "-" },
              { label: "User", value: data.user ?? "-" },
              {
                label: "Created",
                value: formatDateTime(data.created_at) || "-",
              },
              { label: "ID", value: <code>{data.id}</code> },
            ]}
          />
        </Panel>
      ) : null}
      {data && editing && (
        <EditSecurityServiceDialog
          projectId={projectId}
          service={data}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
