// The reserve dialog (the slot picker's modal in nectar_reservations.js)
// and the extend dialog (_extend.html).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { parseDate, type CalendarDate } from "@internationalized/date";
import {
  Alert,
  DatePicker,
  DateRangePicker,
  FieldError,
  Label,
  Text,
} from "@ardc-ui/react";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import type {
  FreeSlot,
  Reservation,
  ReservationFlavor,
  ReservationOptions,
} from "../../lib/api/types";
import { formatCalendarDate, formatNumber } from "../../lib/format";
import { notify } from "../../lib/notify";
import {
  extendOptionsQuery,
  useCreateReservation,
  useExtendReservation,
} from "./api";
import {
  daysBetween,
  eligibility,
  flavorRate,
  slotFirstDay,
  slotLastDay,
} from "./status";
import styles from "./ReservationsPage.module.scss";

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
  flavor,
  slot,
  options,
  onClose,
}: {
  projectId: string;
  flavor: ReservationFlavor;
  slot: FreeSlot;
  options: ReservationOptions;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const create = useCreateReservation(projectId);
  const first = slotFirstDay(slot.start, options.today);
  const last = slotLastDay(slot.end) ?? first;
  const [range, setRange] = useState<Range>(() => {
    const start = safeDate(first);
    return start ? { start, end: start } : null;
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
  const minValue = safeDate(first);
  const maxValue = safeDate(last);
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Reserve ${flavor.name ?? "flavour"}`}
      submitLabel="Reserve"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <p>
        Available from {formatCalendarDate(first)} to {formatCalendarDate(last)}
        . Reservations run from the start of the first day to the end of the
        last day (UTC); one starting today begins in a few minutes.
      </p>
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
          Up to {check.maxDays} {check.maxDays === 1 ? "day" : "days"} for this
          flavour with your project&apos;s remaining limit.
        </Text>
        <FieldError>{check.reasons[0]}</FieldError>
      </DateRangePicker>
      <div className={styles.summary} aria-live="polite">
        <p className={styles.estimate}>
          <strong>{days}</strong> {days === 1 ? "day" : "days"} selected
          {check.suEstimate !== null && (
            <>
              , about <strong>{formatNumber(check.suEstimate)} SU</strong> at{" "}
              {flavorRate(flavor)}
            </>
          )}
          .
        </p>
        {days > 0 && check.eligible && (
          <Alert tone="success" role="status">
            Eligible.
            {options.su_budget !== null && options.su_budget > 0
              ? " This estimate does not include SU used between now and the start date."
              : ""}
          </Alert>
        )}
        {days > 0 && !check.eligible && (
          <Alert tone="danger" role="status">
            Not eligible: {check.reasons.join(" ")}
          </Alert>
        )}
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
