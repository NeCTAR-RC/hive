// One zone: its details and record sets (designate-dashboard zone detail
// and record sets panel). SOA and apex NS record sets are read-only.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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
import { StatusPill } from "../../components/StatusPill/StatusPill";
import { ApiError } from "../../lib/api/client";
import type { RecordSet } from "../../lib/api/types";
import { formatDateTime } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { RouteLink } from "../../components/RouteLink/RouteLink";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { zoneRoute } from "../../app/router";
import { recordSetsQuery, useDeleteRecordSet, useDeleteZone } from "./api";
import { CreateRecordSetDialog, EditRecordSetDialog } from "./RecordSetDialogs";
import { statusLabel, statusTone } from "./status";
import { EditZoneDialog } from "./ZoneDialogs";
import styles from "./Dns.module.scss";

type Dialog =
  | { kind: "create" }
  | { kind: "edit"; recordset: RecordSet }
  | { kind: "zone" }
  | null;

export function ZoneDetailPage() {
  const projectId = useProjectId();
  const { zoneId } = zoneRoute.useParams();
  const navigate = useNavigate();
  const recordsets = useQuery(recordSetsQuery(projectId, zoneId));
  const removeZone = useDeleteZone(projectId);
  const removeRecordSet = useDeleteRecordSet(projectId);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleting, setDeleting] = useState<RecordSet[]>([]);
  const [deletingZone, setDeletingZone] = useState(false);
  const zone = recordsets.data?.zone;

  const columns = useMemo<ColumnDef<RecordSet>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => <span className={styles.mono}>{row.name}</span>,
        sortValue: (row) => row.name ?? "",
        textValue: (row) =>
          `${row.name ?? ""} ${row.type ?? ""} ${row.records.join(" ")} ${row.description ?? ""}`,
      },
      {
        id: "type",
        label: "Type",
        cell: (row) => row.type ?? "",
        sortValue: (row) => row.type ?? "",
      },
      {
        id: "records",
        label: "Records",
        cell: (row) => (
          <ul className={styles.records}>
            {row.records.map((record) => (
              <li key={record}>{record}</li>
            ))}
          </ul>
        ),
        hideBelow: "md",
      },
      {
        id: "ttl",
        label: "TTL",
        cell: (row) => (row.ttl === null ? "Zone default" : String(row.ttl)),
        sortValue: (row) => row.ttl ?? -1,
        hideBelow: "lg",
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
    ],
    [],
  );
  const rows = useMemo(
    () => filterRows(recordsets.data?.items ?? [], query, columns),
    [recordsets.data, query, columns],
  );

  const confirmDelete = async () => {
    const results = await Promise.allSettled(
      deleting.map((r) => removeRecordSet.mutateAsync({ zoneId, id: r.id })),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        deleting.length === 1
          ? `Deleting record set ${deleting[0]?.name}.`
          : `Deleting ${deleting.length} record sets.`,
      );
    } else {
      notify.danger(
        `Could not delete ${failed} of ${deleting.length} record sets.`,
      );
    }
    setDeleting([]);
  };

  const crumbs = [
    { label: "Project" },
    { label: "DNS" },
    { label: "Zones", href: "/dns/zones" },
  ];
  if (
    recordsets.isError &&
    recordsets.error instanceof ApiError &&
    recordsets.error.status === 404
  ) {
    return (
      <>
        <PageHeader title="Zone not found" crumbs={crumbs} />
        <p>
          There is no zone <code>{zoneId}</code> in this project.{" "}
          <RouteLink to="/dns/zones" search={{}}>
            Back to zones
          </RouteLink>
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={zone?.name ?? "Zone"}
        crumbs={crumbs}
        actions={
          zone ? (
            <div className={styles.actions}>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setDialog({ kind: "zone" })}
                isDisabled={zone.is_transitional}
              >
                Edit zone
              </Button>
              <Button
                variant="secondary"
                tone="danger"
                size="sm"
                onPress={() => setDeletingZone(true)}
                isDisabled={zone.is_transitional}
              >
                Delete zone
              </Button>
            </div>
          ) : null
        }
      />
      {recordsets.isError ? (
        <ErrorState
          error={recordsets.error}
          onRetry={() => recordsets.refetch()}
        />
      ) : (
        <div className={styles.stack}>
          {zone ? (
            <Panel title="Zone" headingLevel={2}>
              <div className={styles.grid}>
                <KeyValueList
                  items={[
                    {
                      label: "Status",
                      value: (
                        <StatusPill tone={statusTone(zone.status)}>
                          {statusLabel(zone.status, zone.action)}
                        </StatusPill>
                      ),
                    },
                    { label: "Type", value: zone.type ?? "-" },
                    { label: "Contact email", value: zone.email ?? "-" },
                    { label: "Default TTL", value: zone.ttl ?? "-" },
                  ]}
                />
                <KeyValueList
                  items={[
                    { label: "Serial", value: zone.serial ?? "-" },
                    { label: "Description", value: zone.description || "-" },
                    {
                      label: "Masters",
                      value: zone.masters.length
                        ? zone.masters.join(", ")
                        : "-",
                    },
                    {
                      label: "Created",
                      value: formatDateTime(zone.created_at) || "-",
                    },
                    { label: "ID", value: <code>{zone.id}</code> },
                  ]}
                />
              </div>
            </Panel>
          ) : (
            <SkeletonLines lines={4} />
          )}
          <DataTable
            id="recordsets"
            label="Record sets"
            columns={columns}
            rows={rows}
            getRowId={(row) => row.id}
            isLoading={recordsets.isPending}
            isFetching={recordsets.isFetching}
            error={recordsets.error}
            onRetry={() => void recordsets.refetch()}
            onRefresh={() => void recordsets.refetch()}
            search={{
              value: query,
              onChange: setQuery,
              placeholder: "Search record sets",
            }}
            resetKey={query}
            toolbarActions={
              <Button
                size="xs"
                onPress={() => setDialog({ kind: "create" })}
                isDisabled={!zone || zone.is_transitional}
              >
                Create record set
              </Button>
            }
            emptyTitle="No record sets"
            defaultSort={{ column: "name", direction: "ascending" }}
            rowActions={(row) => [
              {
                id: "edit",
                label: "Edit record set",
                isDisabled: !row.can_edit || row.is_transitional,
                disabledReason: row.can_edit
                  ? "Wait for the pending change to finish."
                  : "This record set is managed by the DNS service.",
                onAction: () => setDialog({ kind: "edit", recordset: row }),
              },
              {
                id: "delete",
                label: "Delete record set",
                tone: "danger",
                isDisabled: !row.can_edit || row.is_transitional,
                disabledReason: row.can_edit
                  ? "Wait for the pending change to finish."
                  : "This record set is managed by the DNS service.",
                onAction: () => setDeleting([row]),
              },
            ]}
            batchActions={[
              {
                id: "delete",
                label: "Delete",
                tone: "danger",
                isDisabled: (selected) => selected.every((r) => !r.can_edit),
                onAction: (selected) =>
                  setDeleting(
                    selected.filter((r) => r.can_edit && !r.is_transitional),
                  ),
              },
            ]}
          />
        </div>
      )}
      {dialog?.kind === "create" && zone && (
        <CreateRecordSetDialog
          projectId={projectId}
          zone={zone}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "edit" && zone && (
        <EditRecordSetDialog
          projectId={projectId}
          zone={zone}
          recordset={dialog.recordset}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "zone" && zone && (
        <EditZoneDialog
          projectId={projectId}
          zone={zone}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete record set ${deleting[0]?.name}?`
            : `Delete ${deleting.length} record sets?`
        }
        confirmLabel="Delete"
        isPending={removeRecordSet.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>The records stop resolving once the change is published.</p>
      </ConfirmDialog>
      <ConfirmDialog
        isOpen={deletingZone}
        onOpenChange={setDeletingZone}
        title={`Delete zone ${zone?.name}?`}
        confirmLabel="Delete"
        confirmText={zone?.name ?? ""}
        isPending={removeZone.isPending}
        error={removeZone.error}
        onConfirm={() =>
          removeZone.mutate(zoneId, {
            onSuccess: () => {
              notify.success(`Deleting zone ${zone?.name}.`);
              void navigate({ to: "/dns/zones" });
            },
          })
        }
      >
        <p>All record sets in the zone are deleted with it.</p>
      </ConfirmDialog>
    </>
  );
}
