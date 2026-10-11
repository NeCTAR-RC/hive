// Zones (designate-dashboard zones panel): the project's DNS zones, with
// create, edit and delete and the zone quota.
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
import { QuotaMeter } from "../../components/QuotaMeter/QuotaMeter";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import type { Zone } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { zonesRoute } from "../../app/router";
import { useDeleteZone, zonesQuery } from "./api";
import { statusLabel, statusTone } from "./status";
import { CreateZoneDialog, EditZoneDialog } from "./ZoneDialogs";
import styles from "./Dns.module.scss";

export function ZonesPage() {
  const projectId = useProjectId();
  const search = zonesRoute.useSearch();
  const navigate = useNavigate({ from: zonesRoute.fullPath });
  const zones = useQuery(zonesQuery(projectId));
  const remove = useDeleteZone(projectId);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Zone | null>(null);
  const [deleting, setDeleting] = useState<Zone[]>([]);
  const creating = search.create === true;
  const setCreating = (open: boolean) =>
    void navigate({ search: open ? { create: true } : {}, replace: true });

  const columns = useMemo<ColumnDef<Zone>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/dns/zones/$zoneId"
            params={{ zoneId: row.id }}
            className={styles.nameLink}
          >
            {row.name}
          </RouterLink>
        ),
        sortValue: (row) => row.name,
        textValue: (row) =>
          `${row.name} ${row.description ?? ""} ${row.email ?? ""}`,
      },
      {
        id: "type",
        label: "Type",
        cell: (row) => row.type ?? "",
        sortValue: (row) => row.type ?? "",
        hideBelow: "md",
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row.status)}>
            {statusLabel(row.status, row.action)}
          </StatusPill>
        ),
        sortValue: (row) => row.status ?? "",
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => row.description ?? "",
        hideBelow: "lg",
      },
    ],
    [],
  );
  const rows = useMemo(
    () => filterRows(zones.data?.items ?? [], query, columns),
    [zones.data, query, columns],
  );
  const quota = zones.data?.quota ?? {};
  const limit = typeof quota["zones"] === "number" ? quota["zones"] : null;
  const used = zones.data?.items.length ?? 0;

  const confirmDelete = async () => {
    const results = await Promise.allSettled(
      deleting.map((z) => remove.mutateAsync(z.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        deleting.length === 1
          ? `Deleting zone ${deleting[0]?.name}.`
          : `Deleting ${deleting.length} zones.`,
      );
    } else {
      notify.danger(`Could not delete ${failed} of ${deleting.length} zones.`);
    }
    setDeleting([]);
  };

  return (
    <>
      <PageHeader
        title="Zones"
        crumbs={[{ label: "Project" }, { label: "DNS" }]}
        actions={
          <Button
            size="sm"
            onPress={() => setCreating(true)}
            isDisabled={limit !== null && limit >= 0 && used >= limit}
          >
            Create zone
          </Button>
        }
      >
        {zones.data && limit !== null && (
          <div className={styles.meters}>
            <QuotaMeter
              label="Zones"
              value={used}
              max={limit}
              valueText={`${used} of ${limit < 0 ? "unlimited" : limit} zones`}
            />
          </div>
        )}
      </PageHeader>
      <DataTable
        id="zones"
        label="Zones"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={zones.isPending}
        isFetching={zones.isFetching}
        error={zones.error}
        onRetry={() => void zones.refetch()}
        onRefresh={() => void zones.refetch()}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search zones",
        }}
        resetKey={query}
        emptyTitle={
          zones.data?.items.length ? "No zones match" : "No zones yet"
        }
        emptyBody={
          zones.data?.items.length === 0 ? (
            <p>Create a zone to manage DNS records for a domain you own.</p>
          ) : null
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "edit",
            label: "Edit zone",
            isDisabled: row.is_transitional,
            disabledReason: "Wait for the pending change to finish.",
            onAction: () => setEditing(row),
          },
          {
            id: "delete",
            label: "Delete zone",
            tone: "danger",
            isDisabled: row.is_transitional,
            disabledReason: "Wait for the pending change to finish.",
            onAction: () => setDeleting([row]),
          },
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            isDisabled: (selected) => selected.every((z) => z.is_transitional),
            onAction: (selected) =>
              setDeleting(selected.filter((z) => !z.is_transitional)),
          },
        ]}
      />
      {creating && (
        <CreateZoneDialog
          projectId={projectId}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <EditZoneDialog
          projectId={projectId}
          zone={editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete zone ${deleting[0]?.name}?`
            : `Delete ${deleting.length} zones?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>All record sets in the zone are deleted with it.</p>
      </ConfirmDialog>
    </>
  );
}
