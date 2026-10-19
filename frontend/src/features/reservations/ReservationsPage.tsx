// Reservations (warre-dashboard content/reservation): the project's
// reservations with the limits shown as days and reservations used.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Tooltip, TooltipTrigger } from "@ardc-ui/react";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { ExternalLink } from "../../components/ExternalLink/ExternalLink";
import { Panel } from "../../components/Panel/Panel";
import { RouteLink } from "../../components/RouteLink/RouteLink";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import type { Reservation } from "../../lib/api/types";
import { downloadUrl } from "../../lib/download";
import { formatDateTime } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { reservationsQuery, useDeleteReservation } from "./api";
import {
  flavorSize,
  RESERVATIONS_HELP,
  statusLabel,
  statusTone,
} from "./status";
import { ReservationLimits } from "./ReservationLimits";
import styles from "./ReservationsPage.module.scss";

export function ReservationsPage() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const reservations = useQuery(reservationsQuery(projectId));
  const remove = useDeleteReservation(projectId);
  const [deleting, setDeleting] = useState<Reservation[]>([]);
  const limits = reservations.data?.limits;
  const canCreate = limits?.can_create ?? true;

  const columns = useMemo<ColumnDef<Reservation>[]>(
    () => [
      {
        id: "id",
        label: "ID",
        isRowHeader: true,
        cell: (row) => (
          <RouteLink
            to="/reservations/$reservationId"
            params={{ reservationId: row.id }}
          >
            <code>{row.id}</code>
          </RouteLink>
        ),
        sortValue: (row) => row.id,
        textValue: (row) => row.id,
      },
      {
        id: "flavor",
        label: "Flavour",
        cell: (row) => (
          <span>
            {row.flavor.name ?? ""}
            <span className={styles.muted}> {flavorSize(row.flavor)}</span>
          </span>
        ),
        sortValue: (row) => row.flavor.name ?? "",
        textValue: (row) => row.flavor.name ?? "",
      },
      {
        id: "start",
        label: "Start",
        cell: (row) => formatDateTime(row.start),
        sortValue: (row) => row.start ?? "",
      },
      {
        id: "end",
        label: "End",
        cell: (row) => formatDateTime(row.end),
        sortValue: (row) => row.end ?? "",
        hideBelow: "md",
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row.status)}>
            {statusLabel(row.status)}
          </StatusPill>
        ),
        sortValue: (row) => row.status,
      },
    ],
    [],
  );

  const confirmDelete = async () => {
    const results = await Promise.allSettled(
      deleting.map((row) => remove.mutateAsync(row.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        deleting.length === 1
          ? `Reservation ${deleting[0]?.id} deleted.`
          : `${deleting.length} reservations deleted.`,
      );
    } else {
      notify.danger(
        `Could not delete ${failed} of ${deleting.length} reservations.`,
      );
    }
    setDeleting([]);
  };

  return (
    <>
      <PageHeader
        title="Reservations"
        crumbs={[{ label: "Project" }, { label: "Compute" }]}
        actions={
          canCreate ? (
            <RouteLink variant="primary" size="sm" to="/reservations/new">
              Create reservation
            </RouteLink>
          ) : (
            <TooltipTrigger>
              <RouteLink variant="primary" size="sm" to="/reservations/new">
                Create reservation (quota exceeded)
              </RouteLink>
              <Tooltip>
                Your project has no reservation days or reservations left.
              </Tooltip>
            </TooltipTrigger>
          )
        }
      >
        <p className={styles.intro}>
          Reserve a flavour for a period so an instance of that size is
          guaranteed when you need it. Read{" "}
          <ExternalLink href={RESERVATIONS_HELP}>
            the reservation guide
          </ExternalLink>{" "}
          first. GPU flavours are not available to Auckland users. Times are
          shown in your browser&apos;s time zone; reservations run in UTC.
        </p>
      </PageHeader>
      <div className={styles.stack}>
        <Panel title="Project limits">
          {reservations.isPending ? (
            <SkeletonLines lines={2} />
          ) : limits ? (
            <ReservationLimits limits={limits} />
          ) : null}
        </Panel>
        <DataTable
          id="reservations"
          label="Reservations"
          columns={columns}
          rows={reservations.data?.items}
          getRowId={(row) => row.id}
          isLoading={reservations.isPending}
          isFetching={reservations.isFetching}
          error={reservations.error}
          onRetry={() => void reservations.refetch()}
          onRefresh={() => void reservations.refetch()}
          emptyTitle="No reservations yet"
          emptyBody={
            <p>
              Create a reservation to hold a flavour for the days you need it.
            </p>
          }
          defaultSort={{ column: "start", direction: "descending" }}
          rowActions={(row) => [
            {
              id: "launch",
              label: "Launch instance",
              isDisabled: !row.actions.includes("launch"),
              disabledReason: "The reservation is not active yet.",
              onAction: () =>
                void navigate({
                  to: "/compute/instances/launch",
                  search: { flavor: row.compute_flavor ?? "" },
                }),
            },
            {
              id: "extend",
              label: "Extend reservation",
              isDisabled: !row.actions.includes("extend"),
              disabledReason:
                "Only active reservations with days left can be extended.",
              onAction: () =>
                void navigate({
                  to: "/reservations/$reservationId",
                  params: { reservationId: row.id },
                  search: { extend: true },
                }),
            },
            {
              id: "calendar",
              label: "Add to calendar (.ics)",
              isDisabled: !row.actions.includes("calendar"),
              disabledReason:
                "Only allocated or active reservations have a calendar entry.",
              onAction: () =>
                downloadUrl(
                  `/api/reservations/${row.id}/calendar.ics`,
                  `nectar-reservation-${row.id}.ics`,
                ),
            },
            {
              id: "delete",
              label: "Delete reservation",
              tone: "danger",
              isDisabled: !row.actions.includes("delete"),
              disabledReason:
                "A reservation still being created cannot be deleted.",
              onAction: () => setDeleting([row]),
            },
          ]}
          batchActions={[
            {
              id: "delete",
              label: "Delete",
              tone: "danger",
              isDisabled: (rows) =>
                rows.every((r) => !r.actions.includes("delete")),
              onAction: (rows) =>
                setDeleting(rows.filter((r) => r.actions.includes("delete"))),
            },
          ]}
        />
      </div>
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete reservation ${deleting[0]?.id}?`
            : `Delete ${deleting.length} reservations?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>Deleted reservations are not recoverable.</p>
      </ConfirmDialog>
    </>
  );
}
