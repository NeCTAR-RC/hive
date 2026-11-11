// Reservations (warre-dashboard content/reservation): the project's
// reservations with the limits shown as days and reservations used.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipTrigger } from "@ardc-ui/react";
import { AppLink } from "../../components/AppLink/AppLink";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { useQueryTable } from "../../components/DataTable/useQueryTable";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import { allows, toRowActions } from "../../lib/actions";
import type { Reservation } from "../../lib/api/types/reservations";
import { useProjectId } from "../../lib/hooks/useProjectId";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { reservationsQuery } from "./api";
import { formatReservedDays } from "./days";
import { Limits } from "./Limits";
import { useReservationActions } from "./ReservationActions";
import {
  availableReservationActions,
  flavorSize,
  RESERVATIONS_HELP,
  statusLabel,
  statusTone,
} from "./status";
import styles from "./ReservationsPage.module.scss";

export function ReservationsPage() {
  const projectId = useProjectId();
  const reservations = useQuery(reservationsQuery(projectId));
  const reservationsTable = useQueryTable(reservations, {
    noun: "reservations",
    emptyTitle: "No reservations yet",
  });
  const { run, dialogs, tableProps } = useReservationActions();
  const limits = reservations.data?.limits;
  const canCreate = limits?.can_create ?? true;

  const columns = useMemo<ColumnDef<Reservation>[]>(
    () => [
      {
        id: "id",
        label: "ID",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/reservations/$reservationId"
            params={{ reservationId: row.id }}
          >
            <code>{row.id}</code>
          </AppLink>
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
        label: "Reserved (UTC days)",
        cell: (row) => formatReservedDays(row.start, row.end),
        sortValue: (row) => row.start ?? "",
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

  return (
    <>
      <PageHeader
        title="Reservations"
        crumbs={[{ label: "Project" }, { label: "Compute" }]}
        actions={
          canCreate ? (
            <AppLink variant="primary" size="sm" to="/reservations/new">
              Create reservation
            </AppLink>
          ) : (
            <TooltipTrigger>
              <AppLink variant="primary" size="sm" to="/reservations/new">
                Create reservation (quota exceeded)
              </AppLink>
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
          <AppLink href={RESERVATIONS_HELP} newTab>
            the reservation guide
          </AppLink>{" "}
          first. GPU flavours are not available to Auckland users. Times are
          shown in your browser&apos;s time zone; reservations run in UTC.
        </p>
      </PageHeader>
      <div className={styles.stack}>
        <Panel title="Project limits">
          {reservations.isPending ? (
            <SkeletonLines lines={2} />
          ) : limits ? (
            <div className={styles.limits}>
              <Limits limits={limits} />
            </div>
          ) : null}
        </Panel>
        <DataTable
          id="reservations"
          label="Reservations"
          columns={columns}
          getRowId={(row) => row.id}
          {...reservationsTable}
          {...tableProps}
          emptyBody={
            <p>
              Create a reservation to hold a flavour for the days you need it.
            </p>
          }
          defaultSort={{ column: "start", direction: "descending" }}
          rowActions={(row) =>
            toRowActions(availableReservationActions(row), (id) =>
              run(id, [row]),
            )
          }
          batchActions={[
            {
              id: "delete",
              label: "Delete",
              tone: "danger",
              isDisabled: (rows) =>
                !rows.some((r) =>
                  allows(availableReservationActions(r), "delete"),
                ),
              onAction: (rows) => run("delete", rows),
            },
          ]}
        />
      </div>
      {dialogs}
    </>
  );
}
