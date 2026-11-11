// Create a reservation, laid out as warre-dashboard's create.html: the
// flavour class notes and limits on top, then the availability chart with
// its class and zone filters, and the feedback block at the foot.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Alert } from "@ardc-ui/react";
import { AppLink } from "../../components/AppLink/AppLink";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { useLeaveGuard } from "../../components/LeaveGuard/useLeaveGuard";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { formatCalendarDate } from "../../lib/format";
import { useProjectId } from "../../lib/hooks/useProjectId";
import { useSearchPatch } from "../../lib/hooks/useSearchPatch";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { reservationOptionsQuery, slotsQuery } from "./api";
import { AvailabilityFilters } from "./AvailabilityFilters";
import { ReserveDialog } from "./dialogs/ReserveDialog";
import { FeedbackPanel } from "./FeedbackPanel";
import { FlavorClassesPanel } from "./FlavorClassesPanel";
import {
  buildRows,
  ganttRange,
  searchCoverage,
  type PickedSlot,
} from "./gantt";
import { Limits } from "./Limits";
import { SlotGantt } from "./SlotGantt";
import { Usage } from "./Usage";
import styles from "./CreateReservationPage.module.scss";

const createReservationRoute = getRouteApi("/app/reservations/new");

/**
 * The create page: pick a free slot of a flavour on the availability chart
 * and confirm its dates in the reserve dialog. The chart's class and zone
 * filters live in the URL search; a picked slot holds the leave guard
 * until the reservation is made.
 */
export function CreateReservationPage() {
  const projectId = useProjectId();
  const search = createReservationRoute.useSearch();
  const setFilter = useSearchPatch(createReservationRoute);
  const options = useQuery(reservationOptionsQuery(projectId));
  const category = search.category ?? "";
  const zone = search.zone ?? "";
  const today = options.data?.today;
  const range = useMemo(() => (today ? ganttRange(today) : null), [today]);
  const slots = useQuery({
    ...slotsQuery(projectId, {
      ...(category ? { category } : {}),
      ...(zone ? { availability_zone: zone } : {}),
      ...(range ? { end: range.last } : {}),
    }),
    enabled: range !== null,
  });
  const [picked, setPicked] = useState<PickedSlot | null>(null);
  const navigate = useNavigate();
  // A picked slot opens the reserve dialog: the reservation is under way.
  const guard = useLeaveGuard({
    isDirty: picked !== null,
    title: "Leave without creating the reservation?",
  });

  const rows = useMemo(() => {
    if (!range || !slots.data) return [];
    return buildRows(
      slots.data.flavors,
      slots.data.slots,
      options.data?.maintenance_windows ?? [],
      range,
    );
  }, [range, slots.data, options.data]);
  // Horizon lists every flavour the search returns, so a fully booked one
  // keeps its row and says it has no free slot.
  const anyFree = rows.some((row) =>
    row.bars.some((bar) => bar.kind === "free"),
  );
  // The backend clamps the search end (today plus 730 days); say so when it
  // stopped short of the chart.
  const coverage =
    range && slots.data ? searchCoverage(range, slots.data.end) : null;

  const limits = options.data?.limits;
  const canCreate = limits?.can_create ?? true;

  return (
    <>
      <PageHeader
        title="Create reservation"
        crumbs={[
          { label: "Project" },
          { label: "Compute" },
          { label: "Reservations", href: "/reservations" },
        ]}
        actions={
          <AppLink variant="secondary" size="sm" to="/reservations">
            Back
          </AppLink>
        }
      >
        <p className={styles.intro}>
          To make a reservation, select an available time slot from the chart
          below. You can customise the reservation start and end dates within
          the available time slot. Reservations are specified in days and must
          be a minimum of 1 day. All flavours have a maximum number of days they
          can be reserved for, which is shown in the flavour details.
        </p>
      </PageHeader>
      <div className={styles.stack}>
        <div className={styles.columns}>
          <FlavorClassesPanel />
          <div className={styles.aside}>
            <Panel title="Reservation limits">
              {options.isPending ? (
                <SkeletonLines lines={2} />
              ) : options.isError ? (
                <ErrorState
                  error={options.error}
                  onRetry={() => options.refetch()}
                />
              ) : limits ? (
                <div className={styles.limits}>
                  <Limits limits={limits} />
                </div>
              ) : null}
            </Panel>
            <Panel title="Usage limit">
              {options.isPending ? (
                <SkeletonLines lines={1} />
              ) : options.data ? (
                <Usage options={options.data} />
              ) : null}
            </Panel>
          </div>
        </div>
        <Panel title="Select flavour availability">
          <div className={styles.panelBody}>
            <AvailabilityFilters
              category={category}
              zone={zone}
              categories={options.data?.categories ?? []}
              zones={options.data?.availability_zones ?? []}
              onFilter={setFilter}
            />
            {options.isError ? (
              <ErrorState
                error={options.error}
                onRetry={() => options.refetch()}
              />
            ) : options.data && !canCreate ? (
              <Alert tone="danger" role="status">
                You can&apos;t create a reservation because your project limits
                have been reached.
              </Alert>
            ) : slots.isPending || !range ? (
              <SkeletonLines lines={6} />
            ) : slots.isError ? (
              <ErrorState error={slots.error} onRetry={() => slots.refetch()} />
            ) : rows.length === 0 ? (
              <Alert tone="warning" role="status">
                There are no available time slots for this selection.
              </Alert>
            ) : (
              <>
                {!anyFree && (
                  <Alert tone="warning" role="status">
                    There are no available time slots for this selection.
                  </Alert>
                )}
                {coverage?.clamped && (
                  <Alert tone="info" role="status">
                    Free time slots are shown up to{" "}
                    {formatCalendarDate(coverage.searchedTo)}.
                  </Alert>
                )}
                <SlotGantt
                  rows={rows}
                  range={range}
                  searchedTo={coverage?.searchedTo ?? range.last}
                  daysLeft={limits?.days_left ?? null}
                  canReserve={canCreate}
                  onPick={setPicked}
                />
              </>
            )}
          </div>
        </Panel>
        <FeedbackPanel />
      </div>
      {picked && options.data && (
        <ReserveDialog
          picked={picked}
          options={options.data}
          onClose={() => setPicked(null)}
          onReserved={(reservation) =>
            guard.leave(
              () =>
                void navigate({
                  to: "/reservations/$reservationId",
                  params: { reservationId: reservation.id },
                }),
            )
          }
        />
      )}
      {guard.dialog}
    </>
  );
}
