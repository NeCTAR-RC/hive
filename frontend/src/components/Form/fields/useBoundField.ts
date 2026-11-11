import { useEffect, useRef } from "react";
import { useController, useFormContext } from "react-hook-form";
import type { FieldPath, FieldValues } from "react-hook-form";

/**
 * One field of the form that the nearest `<Form>` or `<FormDialog>`
 * provides. Every binding reads its field through here, so value, blur and
 * validity reach the design-system field the same way everywhere:
 * `fieldProps` spreads onto the field, `value` and `onChange` are the
 * binding's to convert, and `errorMessage` goes to its `FieldError`.
 *
 * Validation is react-hook-form's (the zod schema); the field only shows
 * the result, hence `validationBehavior: "aria"`.
 *
 * A field showing an error checks itself again whenever its value changes,
 * however it changed (the user's pick, or the form setting it), so a fixed
 * field clears its message at once. react-hook-form alone re-validates on
 * change only after a submit or a blur, which leaves the message of a field
 * that a wizard's Next flagged, or that the form filled in, standing.
 */
export function useBoundField<
  T extends FieldValues,
  TName extends FieldPath<T> = FieldPath<T>,
>(name: TName) {
  const { control, trigger } = useFormContext<T>();
  const { field, fieldState } = useController({ control, name });
  const lastValue = useRef<unknown>(field.value);
  const { invalid } = fieldState;
  useEffect(() => {
    // Only a change of value re-checks: an error set by the server, on an
    // unchanged value, stays until the user edits the field.
    if (Object.is(lastValue.current, field.value)) return;
    lastValue.current = field.value;
    if (invalid) void trigger(name);
  }, [field.value, invalid, name, trigger]);
  return {
    value: field.value,
    onChange: field.onChange,
    fieldProps: {
      name: field.name,
      onBlur: field.onBlur,
      isInvalid: invalid,
      validationBehavior: "aria" as const,
    },
    errorMessage: fieldState.error?.message,
  };
}
