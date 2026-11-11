// The "Reserve time slot" modal (create.html:126-187 with the eligibility
// panel of nectar_reservations.js:581-710).
import { useMemo } from "react";
import {
  Alert,
  Card,
  DateRangePicker,
  FieldError,
  Label,
  Text,
} from "@ardc-ui/react";
import { useController } from "react-hook-form";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../components/FormDialog/useMutationForm";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { StackedMeter } from "../../../components/StackedMeter/StackedMeter";
import type {
  Reservation,
  ReservationOptions,
} from "../../../lib/api/types/reservations";
import { formatCalendarDate, formatNumber } from "../../../lib/format";
import { useCreateReservation } from "../api";
import styles from "../CreateReservationPage.module.scss";
import type { PickedSlot } from "../gantt";
import { flavorDisk, flavorRate, flavorSize } from "../status";
import { checkDates, reserveSchema, safeDate } from "./reserve";

/**
 * Reserves the picked flavour for dates the user confirms: the flavour's
 * facts, a date range picker opened on the proposal from the chart and
 * bounded by the free slot, and the eligibility panel that checks the days
 * and service units against the project's limits as the dates change.
 */
export function ReserveDialog({
  picked,
  options,
  onClose,
  onReserved,
}: {
  picked: PickedSlot;
  options: ReservationOptions;
  onClose: () => void;
  /** Takes the user on once the reservation is made. */
  onReserved: (reservation: Reservation) => void;
}) {
  const { flavor, bar, selection } = picked;
  const schema = useMemo(
    () => reserveSchema(flavor, options),
    [flavor, options],
  );
  const { form, dialog } = useMutationForm({
    schema,
    defaultValues:
      safeDate(selection.start) && safeDate(selection.end)
        ? { start: selection.start, end: selection.end }
        : { start: "", end: "" },
    mutation: useCreateReservation(),
    // The chart offers slots only for flavours with an id; this narrows it.
    toVariables: (values) =>
      flavor.id
        ? { flavor_id: flavor.id, start: values.start, end: values.end }
        : null,
    successMessage: (reservation) => `Creating reservation ${reservation.id}.`,
    onSuccess: onReserved,
    onDone: onClose,
  });
  // The date range picker edits both dates at once, so it is wired to the
  // form here rather than through a binding.
  const { field: startField } = useController({
    control: form.control,
    name: "start",
  });
  const { field: endField } = useController({
    control: form.control,
    name: "end",
  });
  const rangeStart = safeDate(startField.value);
  const rangeEnd = safeDate(endField.value);
  const range =
    rangeStart && rangeEnd ? { start: rangeStart, end: rangeEnd } : null;
  const { days, check } = checkDates(
    { start: startField.value, end: endField.value },
    flavor,
    options,
  );
  const limits = options.limits;
  const budget =
    options.su_budget !== null && options.su_budget > 0
      ? options.su_budget
      : null;
  const showSu = flavor.rate !== null && flavor.rate > 0 && budget !== null;
  const suTotal = (options.su_used ?? 0) + (check.suEstimate ?? 0);
  const minValue = safeDate(bar.first);
  const maxValue = safeDate(bar.last);
  return (
    <FormDialog
      {...dialog}
      title="Reserve time slot"
      size="lg"
      submitLabel="Reserve"
      isSubmitDisabled={days <= 0 || !check.eligible}
    >
      <div className={styles.reserve}>
        <div className={styles.reserveHead}>
          <h3 className={styles.reserveFlavor}>{flavor.name ?? flavor.id}</h3>
          <KeyValueList
            items={[
              { label: "Class", value: flavor.category },
              { label: "Description", value: flavor.description },
              { label: "Availability zone", value: flavor.availability_zone },
              { label: "Size", value: flavorSize(flavor) },
              { label: "Disk", value: flavorDisk(flavor) },
              {
                label: "Max duration",
                value: `${flavor.max_days} ${flavor.max_days === 1 ? "day" : "days"}`,
              },
              { label: "Usage rate", value: flavorRate(flavor) },
            ]}
          />
        </div>
        <div className={styles.reserveColumns}>
          <section className={styles.reserveGroup}>
            <div className={styles.reserveIntro}>
              <h3 className={styles.reserveHeading}>Confirm dates</h3>
              <p className={styles.reserveText}>
                How long do you want to reserve?
              </p>
            </div>
            <DateRangePicker
              value={range}
              onChange={(next) => {
                startField.onChange(next ? next.start.toString() : "");
                endField.onChange(next ? next.end.toString() : "");
              }}
              isRequired
              isInvalid={days > 0 && !check.eligible}
              {...(minValue ? { minValue } : {})}
              {...(maxValue ? { maxValue } : {})}
            >
              <Label>Reservation dates</Label>
              <Text slot="description">
                Free {formatCalendarDate(bar.first)} to{" "}
                {formatCalendarDate(bar.last)}; up to {check.maxDays}{" "}
                {check.maxDays === 1 ? "day" : "days"} for this flavour with
                your project&apos;s remaining limit.
              </Text>
              <FieldError>{check.reasons[0]}</FieldError>
            </DateRangePicker>
            <div className={styles.reserveIntro}>
              <p className={styles.reserveDays}>
                {days} {days === 1 ? "day" : "days"} selected
              </p>
              {check.suEstimate !== null && (
                <p className={styles.reserveText}>
                  {formatNumber(check.suEstimate)} Service Units
                </p>
              )}
            </div>
            <Alert tone="info">
              Reservations created with today&apos;s date as the start date will
              begin in a few minutes from now. All future reservations will
              begin at 00:00 UTC and end at 23:59 UTC.
            </Alert>
          </section>
          <Card tone="grey">
            <section className={styles.reserveGroup}>
              <div className={styles.reserveIntro}>
                <h3 className={styles.reserveHeading}>Eligibility status</h3>
                <p className={styles.reserveText}>
                  Based on your current usage and project allocation limits.
                </p>
              </div>
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
              <div role="status" aria-live="polite">
                {days > 0 && check.eligible && (
                  <Alert tone="success">
                    <strong>Eligible</strong>.
                    {budget !== null && (
                      <>
                        {" "}
                        Note: this calculation does not take into account SU
                        usage between now and the reservation start date.
                      </>
                    )}
                  </Alert>
                )}
                {days > 0 && !check.eligible && (
                  <Alert tone="danger">
                    <strong>Not eligible</strong>. {check.reasons.join(" ")}
                  </Alert>
                )}
              </div>
            </section>
          </Card>
        </div>
      </div>
    </FormDialog>
  );
}
