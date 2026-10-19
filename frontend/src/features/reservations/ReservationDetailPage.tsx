// One reservation (warre-dashboard detail.html): status, flavour, and the
// launch, extend, calendar and delete actions.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Alert, Button, Menu, MenuItem, MenuTrigger } from "@ardc-ui/react";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { ExternalLink } from "../../components/ExternalLink/ExternalLink";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { RouteLink } from "../../components/RouteLink/RouteLink";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import type { Reservation } from "../../lib/api/types";
import { formatDateTime, formatMb, formatNumber } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { reservationRoute } from "../../app/router";
import { reservationQuery, useDeleteReservation } from "./api";
import { ExtendDialog } from "./ReservationDialogs";
import {
  flavorDisk,
  flavorRate,
  LAUNCH_HELP,
  statusLabel,
  statusTone,
} from "./status";
import styles from "./ReservationsPage.module.scss";

export function ReservationDetailPage() {
  const projectId = useProjectId();
  const { reservationId } = reservationRoute.useParams();
  const search = reservationRoute.useSearch();
  const navigate = useNavigate({ from: reservationRoute.fullPath });
  const reservation = useQuery(reservationQuery(projectId, reservationId));
  const remove = useDeleteReservation(projectId);
  const [deleting, setDeleting] = useState(false);
  const extending = search.extend === true;
  const setExtending = (open: boolean) =>
    void navigate({
      search: open ? { extend: true } : {},
      replace: true,
    });

  const data = reservation.data;
  return (
    <>
      <PageHeader
        title={`Reservation ${reservationId}`}
        crumbs={[
          { label: "Project" },
          { label: "Compute" },
          { label: "Reservations", href: "/reservations" },
        ]}
        actions={
          data ? (
            <Actions
              reservation={data}
              onExtend={() => setExtending(true)}
              onDelete={() => setDeleting(true)}
            />
          ) : null
        }
      />
      {reservation.isPending ? (
        <SkeletonLines lines={8} />
      ) : reservation.isError ? (
        <ErrorState
          error={reservation.error}
          onRetry={() => reservation.refetch()}
        />
      ) : (
        <Details reservation={reservation.data} />
      )}
      {data && (
        <ExtendDialog
          projectId={projectId}
          reservation={data}
          isOpen={extending}
          onOpenChange={setExtending}
        />
      )}
      <ConfirmDialog
        isOpen={deleting}
        onOpenChange={setDeleting}
        title={`Delete reservation ${reservationId}?`}
        confirmLabel="Delete"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(reservationId, {
            onSuccess: () => {
              notify.success(`Reservation ${reservationId} deleted.`);
              void navigate({ to: "/reservations" });
            },
          })
        }
      >
        <p>Deleted reservations are not recoverable.</p>
      </ConfirmDialog>
    </>
  );
}

function Details({ reservation }: { reservation: Reservation }) {
  return (
    <div className={styles.stack}>
      <StatusNotice reservation={reservation} />
      <div className={styles.grid}>
        <Panel title="Overview">
          <KeyValueList
            items={[
              { label: "ID", value: <code>{reservation.id}</code> },
              {
                label: "Status",
                value: (
                  <StatusPill tone={statusTone(reservation.status)}>
                    {statusLabel(reservation.status)}
                  </StatusPill>
                ),
              },
              { label: "Start", value: formatDateTime(reservation.start) },
              { label: "End", value: formatDateTime(reservation.end) },
              {
                label: "Created",
                value: formatDateTime(reservation.created_at),
              },
              {
                label: "Compute flavour",
                value: reservation.compute_flavor ? (
                  <code>reservation:{reservation.compute_flavor}</code>
                ) : (
                  "-"
                ),
              },
            ]}
          />
        </Panel>
        <Panel title="Flavour">
          <KeyValueList
            items={[
              { label: "Name", value: reservation.flavor.name ?? "-" },
              { label: "Class", value: reservation.flavor.category ?? "-" },
              {
                label: "Description",
                value: reservation.flavor.description || "-",
              },
              {
                label: "Zone",
                value: reservation.flavor.availability_zone ?? "-",
              },
              {
                label: "VCPUs",
                value: formatNumber(reservation.flavor.vcpu) || "-",
              },
              {
                label: "RAM",
                value: formatMb(reservation.flavor.memory_mb) || "-",
              },
              { label: "Disk", value: flavorDisk(reservation.flavor) || "-" },
              {
                label: "Maximum length",
                value: `${reservation.flavor.max_days} ${reservation.flavor.max_days === 1 ? "day" : "days"}`,
              },
              { label: "Usage rate", value: flavorRate(reservation.flavor) },
              {
                label: "Public",
                value: reservation.flavor.is_public ? "Yes" : "No",
              },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}

function StatusNotice({ reservation }: { reservation: Reservation }) {
  switch (reservation.status) {
    case "PENDING_CREATE":
      return (
        <Alert tone="info" role="status">
          The reservation is being created. This page updates on its own.
        </Alert>
      );
    case "ALLOCATED":
      return (
        <Alert tone="info" role="status">
          The flavour is reserved and becomes active at the start time. Read{" "}
          <ExternalLink href={LAUNCH_HELP}>
            how to launch an instance with a reservation
          </ExternalLink>
          .
        </Alert>
      );
    case "ACTIVE":
      return (
        <Alert tone="success" role="status">
          The reservation is active. Launch an instance with the reserved
          flavour before it ends; see{" "}
          <ExternalLink href={LAUNCH_HELP}>the launch guide</ExternalLink>.
        </Alert>
      );
    case "ERROR":
      return (
        <Alert tone="danger" role="status">
          {reservation.status_reason ||
            "Reservation error: please contact Nectar Support."}
        </Alert>
      );
    default:
      return null;
  }
}

function Actions({
  reservation,
  onExtend,
  onDelete,
}: {
  reservation: Reservation;
  onExtend: () => void;
  onDelete: () => void;
}) {
  const can = (action: Reservation["actions"][number]) =>
    reservation.actions.includes(action);
  const calendar = reservation.calendar;
  return (
    <div className={styles.actions}>
      {can("launch") && (
        <RouteLink
          variant="primary"
          size="sm"
          to="/compute/instances/launch"
          search={{ flavor: reservation.compute_flavor ?? "" }}
        >
          Launch instance
        </RouteLink>
      )}
      {can("extend") && (
        <Button variant="secondary" size="sm" onPress={onExtend}>
          Extend
        </Button>
      )}
      {can("calendar") && calendar && (
        <MenuTrigger>
          <Button variant="secondary" size="sm" chevronRight>
            Add to calendar
          </Button>
          {/* Link rows, so each is announced and opened as a link. */}
          <Menu aria-label="Add to calendar" placement="bottom end">
            <MenuItem
              id="ics"
              href={`/api/reservations/${reservation.id}/calendar.ics`}
              download={`nectar-reservation-${reservation.id}.ics`}
            >
              Download .ics file
            </MenuItem>
            <MenuItem
              id="google"
              href={calendar.google}
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Calendar (opens in a new tab)
            </MenuItem>
            <MenuItem
              id="outlook"
              href={calendar.outlook}
              target="_blank"
              rel="noopener noreferrer"
            >
              Outlook, work or school (opens in a new tab)
            </MenuItem>
            <MenuItem
              id="outlook_personal"
              href={calendar.outlook_personal}
              target="_blank"
              rel="noopener noreferrer"
            >
              Outlook.com (opens in a new tab)
            </MenuItem>
          </Menu>
        </MenuTrigger>
      )}
      {can("delete") && (
        <Button variant="secondary" tone="danger" size="sm" onPress={onDelete}>
          Delete
        </Button>
      )}
    </div>
  );
}
