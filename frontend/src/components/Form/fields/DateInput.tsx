import { parseDate, type CalendarDate } from "@internationalized/date";
import { DatePicker } from "@ardc-ui/react";
import type { FieldValues } from "react-hook-form";
import { fieldChrome } from "./fieldChrome";
import type { BindingProps } from "./props";
import { useBoundField } from "./useBoundField";

export interface DateInputProps<T extends FieldValues> extends BindingProps<
  T,
  string | null | undefined
> {
  /** ISO dates, "2026-10-09". */
  minValue?: string;
  maxValue?: string;
}

/** An ISO date ("2026-10-09") as a calendar date, or null when it is not one. */
function toDate(value: unknown): CalendarDate | null {
  if (typeof value !== "string" || !value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

/** A calendar date picker holding an ISO date. Empty is "". */
export function DateInput<T extends FieldValues = never>({
  name,
  label,
  description,
  isRequired,
  isDisabled,
  minValue,
  maxValue,
}: DateInputProps<T>) {
  const { value, onChange, fieldProps, errorMessage } = useBoundField<T>(name);
  const chrome = fieldChrome({ label, description, errorMessage });
  return (
    <DatePicker
      {...fieldProps}
      value={toDate(value)}
      onChange={(next) => onChange(next ? next.toString() : "")}
      isRequired={isRequired}
      isDisabled={isDisabled}
      granularity="day"
      minValue={toDate(minValue) ?? undefined}
      maxValue={toDate(maxValue) ?? undefined}
    >
      {chrome.label}
      {chrome.description}
      {chrome.error}
    </DatePicker>
  );
}
