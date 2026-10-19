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
  Loading,
  Text,
} from "@ardc-ui/react";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { StackedMeter } from "../../components/StackedMeter/StackedMeter";
import type { Reservation, ReservationOptions } from "../../lib/api/types";
import { ApiError } from "../../lib/api/client";
import { formatCalendarDate, formatNumber } from "../../lib/format";
import { notify } from "../../lib/notify";
import {
  extendOptionsQuery,
  useCreateReservation,
  useExtendReservation,
} from "./api";
import type { PickedSlot } from "./SlotGantt";
import { spanDays } from "./gantt";
import { eligibility, flavorFacts } from "./status";
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
    ? spanDays(range.start.toString(), range.end.toString())
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
        <KeyValueList items={flavorFacts(flavor)} />
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
  const extendWindow = useQuery({
    ...extendOptionsQuery(projectId, reservation.id),
    enabled: isOpen,
  });
  const extend = useExtendReservation(projectId);
  const [end, setEnd] = useState<CalendarDate | null>(null);
  const minValue = safeDate(extendWindow.data?.min_end);
  const maxValue = safeDate(extendWindow.data?.max_end);
  const chosen = end ?? minValue;
  const outOfRange = Boolean(
    chosen &&
    ((minValue && chosen.compare(minValue) < 0) ||
      (maxValue && chosen.compare(maxValue) > 0)),
  );
  // A cancelled date or error never carries over to the next opening.
  const close = (open: boolean) => {
    if (!open) {
      setEnd(null);
      extend.reset();
    }
    onOpenChange(open);
  };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!chosen || outOfRange) return;
    extend.mutate(
      { id: reservation.id, end: chosen.toString() },
      {
        onSuccess: () => {
          notify.success(`Extended reservation ${reservation.id}.`);
          close(false);
        },
        onError: (error) => {
          // 400: the date is past the free window; 409: the slot after the
          // reservation has gone. Either way the window changed: reload it.
          if (
            error instanceof ApiError &&
            (error.status === 400 || error.status === 409)
          ) {
            void extendWindow.refetch();
          }
        },
      },
    );
  };
  const available = extendWindow.data?.available ?? false;
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={close}
      title="Extend reservation"
      submitLabel="Extend"
      onSubmit={submit}
      isPending={extend.isPending}
      isSubmitDisabled={!available || !chosen || outOfRange}
      error={extend.error}
    >
      {extendWindow.isPending ? (
        <Loading>Loading the free window...</Loading>
      ) : extendWindow.isError ? (
        <ErrorState
          error={extendWindow.error}
          title="Could not check for free time after the reservation"
          onRetry={() => void extendWindow.refetch()}
        />
      ) : !available ? (
        <Alert tone="warning" role="status">
          This flavour is not available after the current end
          {reservation.end ? ` (${formatCalendarDate(reservation.end)})` : ""}.
          Create a new reservation instead.
        </Alert>
      ) : (
        <>
          <p>
            The reservation can be extended by up to{" "}
            <strong>{extendWindow.data.eligible_days}</strong>{" "}
            {extendWindow.data.eligible_days === 1 ? "day" : "days"}, to{" "}
            {formatCalendarDate(extendWindow.data.max_end)}.
          </p>
          <DatePicker
            value={chosen}
            onChange={setEnd}
            isRequired
            isInvalid={outOfRange}
            granularity="day"
            {...(minValue ? { minValue } : {})}
            {...(maxValue ? { maxValue } : {})}
          >
            <Label>New end date</Label>
            <Text slot="description">
              The reservation ends at the end of this day (UTC).
            </Text>
            <FieldError>
              {outOfRange
                ? `Choose a date from ${formatCalendarDate(minValue?.toString())} to ${formatCalendarDate(maxValue?.toString())}.`
                : null}
            </FieldError>
          </DatePicker>
        </>
      )}
    </FormDialog>
  );
}
