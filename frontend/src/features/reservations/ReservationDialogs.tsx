// The "Reserve time slot" modal (create.html:126-187 with the eligibility
// panel of nectar_reservations.js:581-710) and the extend dialog
// (_extend.html).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { parseDate, type CalendarDate } from "@internationalized/date";
import {
  Alert,
  Check,
  Close,
  DatePicker,
  DateRangePicker,
  FieldError,
  Label,
  Text,
} from "@ardc-ui/react";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { StackedMeter } from "../../components/StackedMeter/StackedMeter";
import type { Reservation, ReservationOptions } from "../../lib/api/types";
import { formatCalendarDate, formatNumber } from "../../lib/format";
import { notify } from "../../lib/notify";
import {
  extendOptionsQuery,
  useCreateReservation,
  useExtendReservation,
} from "./api";
import type { PickedSlot } from "./SlotGantt";
import {
  daysBetween,
  eligibility,
  flavorDisk,
  flavorRate,
  flavorSize,
} from "./status";
import styles from "./CreateReservationPage.module.scss";

type Range = { start: CalendarDate; end: CalendarDate } | null;

function safeDate(value: string | null | undefined): CalendarDate | null {
  if (!value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

export function ReserveDialog({
  projectId,
  picked,
  options,
  onClose,
}: {
  projectId: string;
  picked: PickedSlot;
  options: ReservationOptions;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const create = useCreateReservation(projectId);
  const { flavor, bar, selection } = picked;
  const [range, setRange] = useState<Range>(() => {
    const start = safeDate(selection.start);
    const end = safeDate(selection.end);
    return start && end ? { start, end } : null;
  });
  const days = range
    ? daysBetween(range.start.toString(), range.end.toString())
    : 0;
  const check = eligibility(
    days,
    options.limits.days_left,
    flavor,
    options.su_used,
    options.su_budget,
  );
  const limits = options.limits;
  const budget =
    options.su_budget !== null && options.su_budget > 0
      ? options.su_budget
      : null;
  const showSu = flavor.rate !== null && flavor.rate > 0 && budget !== null;
  const suTotal = (options.su_used ?? 0) + (check.suEstimate ?? 0);
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!range || !check.eligible || !flavor.id) return;
    create.mutate(
      {
        flavor_id: flavor.id,
        start: range.start.toString(),
        end: range.end.toString(),
      },
      {
        onSuccess: (reservation: Reservation) => {
          notify.success(`Creating reservation ${reservation.id}.`);
          onClose();
          void navigate({
            to: "/reservations/$reservationId",
            params: { reservationId: reservation.id },
          });
        },
      },
    );
  };
  const minValue = safeDate(bar.first);
  const maxValue = safeDate(bar.last);
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Reserve time slot"
      size="lg"
      submitLabel="Reserve"
      onSubmit={submit}
      isPending={create.isPending}
      isSubmitDisabled={days <= 0 || !check.eligible}
      error={create.error}
    >
      <div className={styles.reserveHead}>
        <h3 className={styles.reserveFlavor}>{flavor.name ?? flavor.id}</h3>
        <dl className={styles.reserveDetails}>
          <div>
            <dt>Class</dt>
            <dd>{flavor.category ?? "-"}</dd>
          </div>
          <div>
            <dt>Description</dt>
            <dd>{flavor.description || "-"}</dd>
          </div>
          <div>
            <dt>Availability zone</dt>
            <dd>{flavor.availability_zone ?? "-"}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{flavorSize(flavor) || "-"}</dd>
          </div>
          <div>
            <dt>Disk</dt>
            <dd>{flavorDisk(flavor) || "-"}</dd>
          </div>
          <div>
            <dt>Max duration</dt>
            <dd>
              {flavor.max_days} {flavor.max_days === 1 ? "day" : "days"}
            </dd>
          </div>
          <div>
            <dt>Usage rate</dt>
            <dd>{flavorRate(flavor)}</dd>
          </div>
        </dl>
      </div>
      <div className={styles.reserveColumns}>
        <div>
          <h4 className={styles.reserveHeading}>Confirm dates</h4>
          <p>How long do you want to reserve?</p>
          <DateRangePicker
            value={range}
            onChange={setRange}
            isRequired
            isInvalid={days > 0 && !check.eligible}
            {...(minValue ? { minValue } : {})}
            {...(maxValue ? { maxValue } : {})}
          >
            <Label>Reservation dates</Label>
            <Text slot="description">
              Free {formatCalendarDate(bar.first)} to{" "}
              {formatCalendarDate(bar.last)}; up to {check.maxDays}{" "}
              {check.maxDays === 1 ? "day" : "days"} for this flavour with your
              project&apos;s remaining limit.
            </Text>
            <FieldError>{check.reasons[0]}</FieldError>
          </DateRangePicker>
          <p className={styles.reserveDays}>
            {days} {days === 1 ? "day" : "days"} selected
          </p>
          {check.suEstimate !== null && (
            <p className={styles.reserveSu}>
              {formatNumber(check.suEstimate)} Service Units
            </p>
          )}
          <Alert tone="info">
            Reservations created with today&apos;s date as the start date will
            begin in a few minutes from now. All future reservations will begin
            at 00:00 UTC and end at 23:59 UTC.
          </Alert>
        </div>
        <div className={styles.eligibility}>
          <h4 className={styles.reserveHeading}>Eligibility status</h4>
          <p>Based on your current usage and project allocation limits.</p>
          <div className={styles.figure}>
            <p className={styles.figureValue}>
              {limits.days_used + days} /{" "}
              {limits.max_days === null ? "No limit" : limits.max_days}
            </p>
            <p className={styles.figureLabel}>Total days / Max days</p>
            {limits.max_days !== null && (
              <StackedMeter
                label="Total days / Max days"
                used={limits.days_used}
                pending={days}
                max={limits.max_days}
                valueText={`${limits.days_used + days} of ${limits.max_days} days`}
              />
            )}
          </div>
          {showSu && budget !== null && (
            <div className={styles.figure}>
              <p className={styles.figureValue}>
                {formatNumber(Math.round(suTotal))} / {formatNumber(budget)}
              </p>
              <p className={styles.figureLabel}>SU total / SU budget</p>
              <StackedMeter
                label="SU total / SU budget"
                used={options.su_used ?? 0}
                pending={check.suEstimate ?? 0}
                max={budget}
                valueText={`${formatNumber(Math.round(suTotal))} of ${formatNumber(budget)} service units`}
              />
            </div>
          )}
          <div className={styles.verdict} role="status" aria-live="polite">
            {days > 0 && check.eligible && (
              <>
                <p className={styles.eligible}>
                  <Check aria-hidden="true" /> Eligible
                </p>
                {budget !== null && (
                  <p>
                    <strong>Note:</strong> this calculation does not take into
                    account SU usage between now and the reservation start date.
                  </p>
                )}
              </>
            )}
            {days > 0 && !check.eligible && (
              <>
                <p className={styles.notEligible}>
                  <Close aria-hidden="true" /> Not eligible
                </p>
                <p>{check.reasons.join(" ")}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </FormDialog>
  );
}

export function ExtendDialog({
  projectId,
  reservation,
  isOpen,
  onOpenChange,
}: {
  projectId: string;
  reservation: Reservation;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const window = useQuery({
    ...extendOptionsQuery(projectId, reservation.id),
    enabled: isOpen,
  });
  const extend = useExtendReservation(projectId);
  const [end, setEnd] = useState<CalendarDate | null>(null);
  const minValue = safeDate(window.data?.min_end);
  const maxValue = safeDate(window.data?.max_end);
  const chosen = end ?? minValue;
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!chosen) return;
    extend.mutate(
      { id: reservation.id, end: chosen.toString() },
      {
        onSuccess: () => {
          notify.success(`Extended reservation ${reservation.id}.`);
          onOpenChange(false);
        },
      },
    );
  };
  const available = window.data?.available ?? false;
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Extend reservation"
      submitLabel="Extend"
      onSubmit={submit}
      isPending={extend.isPending}
      error={extend.error}
    >
      {window.isPending ? (
        <SkeletonLines lines={3} />
      ) : window.isError || !available ? (
        <Alert tone="warning" role="status">
          This flavour is not available after the current end
          {reservation.end ? ` (${formatCalendarDate(reservation.end)})` : ""}.
          Create a new reservation instead.
        </Alert>
      ) : (
        <>
          <p>
            The reservation can be extended by up to{" "}
            <strong>{window.data.eligible_days}</strong>{" "}
            {window.data.eligible_days === 1 ? "day" : "days"}, to{" "}
            {formatCalendarDate(window.data.max_end)}.
          </p>
          <DatePicker
            value={chosen}
            onChange={setEnd}
            isRequired
            granularity="day"
            {...(minValue ? { minValue } : {})}
            {...(maxValue ? { maxValue } : {})}
          >
            <Label>New end date</Label>
            <Text slot="description">
              The reservation ends at the end of this day (UTC).
            </Text>
          </DatePicker>
        </>
      )}
    </FormDialog>
  );
}
