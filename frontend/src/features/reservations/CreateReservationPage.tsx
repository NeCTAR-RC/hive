// Create a reservation: the free slots per flavour (Horizon's Gantt) as an
// accessible list of windows, filtered by class and availability zone.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Alert, Button, Label, Select, SelectItem } from "@ardc-ui/react";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import type {
  FreeSlot,
  MaintenanceWindow,
  ReservationFlavor,
} from "../../lib/api/types";
import { formatCalendarDate } from "../../lib/format";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { createReservationRoute } from "../../app/router";
import { reservationOptionsQuery, slotsQuery } from "./api";
import { ReserveDialog } from "./ReservationDialogs";
import {
  flavorDisk,
  flavorRate,
  flavorSize,
  slotFirstDay,
  slotLastDay,
} from "./status";
import styles from "./ReservationsPage.module.scss";

const ALL = "__all";

export function CreateReservationPage() {
  const projectId = useProjectId();
  const search = createReservationRoute.useSearch();
  const navigate = useNavigate({ from: createReservationRoute.fullPath });
  const options = useQuery(reservationOptionsQuery(projectId));
  const category = search.category ?? "";
  const zone = search.zone ?? "";
  const slots = useQuery(
    slotsQuery(projectId, {
      ...(category ? { category } : {}),
      ...(zone ? { availability_zone: zone } : {}),
    }),
  );
  const [reserving, setReserving] = useState<{
    flavor: ReservationFlavor;
    slot: FreeSlot;
  } | null>(null);

  const setFilter = (patch: { category?: string; zone?: string }) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous, ...patch };
        if (!next.category) delete next.category;
        if (!next.zone) delete next.zone;
        return next;
      },
      replace: true,
    });

  const byFlavor = useMemo(() => {
    const groups = new Map<string, FreeSlot[]>();
    for (const slot of slots.data?.slots ?? []) {
      const list = groups.get(slot.flavor_id) ?? [];
      list.push(slot);
      groups.set(slot.flavor_id, list);
    }
    return groups;
  }, [slots.data]);

  const canCreate = options.data?.limits.can_create ?? true;
  const flavors = (slots.data?.flavors ?? []).filter(
    (flavor) => flavor.id && byFlavor.has(flavor.id),
  );

  return (
    <>
      <PageHeader
        title="Create reservation"
        crumbs={[
          { label: "Project" },
          { label: "Compute" },
          { label: "Reservations", href: "/reservations" },
        ]}
      >
        <p className={styles.intro}>
          Choose a flavour and one of its free windows, then pick the days. Each
          window shows the earliest and latest day you can reserve.
        </p>
      </PageHeader>
      <div className={styles.stack}>
        {options.isError ? (
          <ErrorState error={options.error} onRetry={() => options.refetch()} />
        ) : options.data && !canCreate ? (
          <Alert tone="danger" role="status">
            You can&apos;t create a reservation because your project limits have
            been reached.
          </Alert>
        ) : null}
        <div className={styles.filters}>
          <Select
            selectedKey={category || ALL}
            onSelectionChange={(key) =>
              setFilter({ category: key === ALL ? "" : String(key) })
            }
            className={styles.filter}
          >
            <Label>Flavour class</Label>
            <SelectItem id={ALL}>All classes</SelectItem>
            {(options.data?.categories ?? []).map((item) => (
              <SelectItem key={item} id={item}>
                {item}
              </SelectItem>
            ))}
          </Select>
          <Select
            selectedKey={zone || ALL}
            onSelectionChange={(key) =>
              setFilter({ zone: key === ALL ? "" : String(key) })
            }
            className={styles.filter}
          >
            <Label>Availability zone</Label>
            <SelectItem id={ALL}>All zones</SelectItem>
            {(options.data?.availability_zones ?? []).map((item) => (
              <SelectItem key={item} id={item}>
                {item}
              </SelectItem>
            ))}
          </Select>
        </div>
        {slots.isPending || options.isPending ? (
          <SkeletonLines lines={6} />
        ) : slots.isError ? (
          <ErrorState error={slots.error} onRetry={() => slots.refetch()} />
        ) : flavors.length === 0 ? (
          <Alert tone="warning" role="status">
            There are no available time slots for this selection.
          </Alert>
        ) : (
          <div className={styles.flavors}>
            {flavors.map((flavor) => (
              <FlavorCard
                key={flavor.id}
                flavor={flavor}
                slots={byFlavor.get(flavor.id ?? "") ?? []}
                windows={options.data?.maintenance_windows ?? []}
                today={options.data?.today ?? ""}
                canReserve={canCreate}
                onReserve={(slot) => setReserving({ flavor, slot })}
              />
            ))}
          </div>
        )}
      </div>
      {reserving && options.data && (
        <ReserveDialog
          projectId={projectId}
          flavor={reserving.flavor}
          slot={reserving.slot}
          options={options.data}
          onClose={() => setReserving(null)}
        />
      )}
    </>
  );
}

function FlavorCard({
  flavor,
  slots,
  windows,
  today,
  canReserve,
  onReserve,
}: {
  flavor: ReservationFlavor;
  slots: FreeSlot[];
  windows: MaintenanceWindow[];
  today: string;
  canReserve: boolean;
  onReserve: (slot: FreeSlot) => void;
}) {
  const maintenance = windows.filter(
    (window) =>
      window.flavors.length === 0 ||
      window.flavors.some((f) => f.id === flavor.id),
  );
  return (
    <Panel title={flavor.name ?? "Flavour"} headingLevel={2}>
      <dl className={styles.specs}>
        <dt>Class</dt>
        <dd>{flavor.category ?? "-"}</dd>
        <dt>Description</dt>
        <dd>{flavor.description || "-"}</dd>
        <dt>Zone</dt>
        <dd>{flavor.availability_zone ?? "-"}</dd>
        <dt>Size</dt>
        <dd>{flavorSize(flavor) || "-"}</dd>
        <dt>Disk</dt>
        <dd>{flavorDisk(flavor) || "-"}</dd>
        <dt>Maximum</dt>
        <dd>
          {flavor.max_days} {flavor.max_days === 1 ? "day" : "days"}
        </dd>
        <dt>Usage rate</dt>
        <dd>{flavorRate(flavor)}</dd>
      </dl>
      <h3 className="visually-hidden">Free windows for {flavor.name}</h3>
      <ul className={styles.slots}>
        {slots.map((slot, index) => {
          const first = slotFirstDay(slot.start, today);
          const last = slotLastDay(slot.end) ?? first;
          const label = `${formatCalendarDate(first)} to ${formatCalendarDate(last)}`;
          return (
            <li key={index} className={styles.slot}>
              <span>{label}</span>
              {canReserve && last >= first && (
                <Button
                  variant="secondary"
                  size="xs"
                  onPress={() => onReserve(slot)}
                  aria-label={`Reserve ${flavor.name ?? "flavour"} from ${label}`}
                >
                  Reserve
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {maintenance.map((window) => (
        <p key={window.id ?? window.start ?? ""} className={styles.maintenance}>
          <strong>Maintenance</strong> {formatCalendarDate(window.start)} to{" "}
          {formatCalendarDate(window.end)}
          {window.note ? `: ${window.note}` : ""}
        </p>
      ))}
    </Panel>
  );
}
