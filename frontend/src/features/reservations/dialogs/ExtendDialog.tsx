// The extend reservation dialog (_extend.html).
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@ardc-ui/react";
import { z } from "zod";
import { fieldsFor } from "../../../components/Form/fields";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../components/FormDialog/useMutationForm";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import type { Reservation } from "../../../lib/api/types/reservations";
import { formatCalendarDate } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { extendOptionsQuery, useExtendReservation } from "../api";
import { nextDay, utcDay } from "../days";
import { extendError, type ExtendBounds } from "./extend";

const baseSchema = z.object({ end: z.string() });

/** The form's rule: the new end is a day inside the window. */
function extendSchema(bounds: ExtendBounds) {
  return baseSchema.superRefine((values, ctx) => {
    const message = extendError(values.end, bounds);
    if (message) ctx.addIssue({ code: "custom", path: ["end"], message });
  });
}

/**
 * Moves a reservation's end date later, within the window the backend
 * offers, preselecting the earliest allowed end: the day after the current
 * last UTC day. A date outside the window, typed or picked, is named as
 * such as soon as it is chosen and Extend stays disabled until it is
 * fixed. When the flavour is not available after the current end, it says
 * to create a new reservation; when the window cannot be loaded, it says so
 * with a retry, and Extend stays disabled either way.
 * A refused extension (400, the date is past the window; 409, the next
 * slot has gone) settles the mutation, which refreshes the window.
 */
export function ExtendDialog({
  reservation,
  onClose,
}: {
  reservation: Reservation;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const window = useQuery(extendOptionsQuery(projectId, reservation.id));
  const currentEnd = utcDay(reservation.end);
  // The earliest allowed end is preselected once the window loads.
  const earliest =
    window.data?.min_end ?? (currentEnd ? nextDay(currentEnd) : "");
  const preselected = useMemo(() => ({ end: earliest }), [earliest]);
  const { DateInput } = fieldsFor<z.infer<typeof baseSchema>>();
  const bounds = useMemo<ExtendBounds>(
    () => ({
      currentEnd,
      minEnd: window.data?.min_end,
      maxEnd: window.data?.max_end,
    }),
    [currentEnd, window.data?.min_end, window.data?.max_end],
  );
  const { form, dialog } = useMutationForm({
    schema: useMemo(() => extendSchema(bounds), [bounds]),
    values: preselected,
    mutation: useExtendReservation(),
    toVariables: (values) => ({ id: reservation.id, end: values.end }),
    successMessage: `Extended reservation ${reservation.id}.`,
    onDone: onClose,
  });
  // Show the problem with the chosen day as it is chosen, not only on submit.
  const { subscribe, trigger } = form;
  useEffect(
    () =>
      subscribe({
        formState: { values: true },
        callback: () => void trigger("end"),
      }),
    [subscribe, trigger],
  );
  const available = window.data?.available ?? false;
  const problem = extendError(form.watch("end"), bounds);
  return (
    <FormDialog
      {...dialog}
      title="Extend reservation"
      submitLabel="Extend"
      isSubmitDisabled={!available || problem !== null}
    >
      {window.isPending ? (
        <SkeletonLines lines={3} />
      ) : window.isError ? (
        <ErrorState
          error={window.error}
          title="Could not check for free time after the reservation"
          onRetry={() => void window.refetch()}
        />
      ) : !available ? (
        <Alert tone="warning" role="status">
          This flavour is not available after the current end
          {currentEnd ? ` (${formatCalendarDate(currentEnd)}, UTC)` : ""}.
          Create a new reservation instead.
        </Alert>
      ) : (
        <>
          <p>
            {currentEnd && (
              <>
                It now ends at the end of{" "}
                <strong>{formatCalendarDate(currentEnd)}</strong> (UTC).{" "}
              </>
            )}
            The reservation can be extended by up to{" "}
            <strong>{window.data.eligible_days}</strong>{" "}
            {window.data.eligible_days === 1 ? "day" : "days"}, to{" "}
            {formatCalendarDate(window.data.max_end)}.
          </p>
          <DateInput
            name="end"
            label="New end date"
            description="The reservation ends at the end of this day (UTC)."
            isRequired
            {...(window.data.min_end ? { minValue: window.data.min_end } : {})}
            {...(window.data.max_end ? { maxValue: window.data.max_end } : {})}
          />
        </>
      )}
    </FormDialog>
  );
}
