// react-hook-form bindings for the design system's fields, one file each.
// A binding reads its field from the form that the nearest `<Form>` or
// `<FormDialog>` provides (`useBoundField`), and renders the label, help
// text and validation message in the design system's slots
// (`fieldChrome`). The fields are rendered as shipped: no binding passes a
// class or style that changes how a field looks.
//
// Each binding edits one value type and emits one empty value for it:
//
// | Binding           | Value                  | Empty       |
// | ----------------- | ---------------------- | ----------- |
// | `TextInput`       | text                   | `""`        |
// | `TextAreaInput`   | text                   | `""`        |
// | `DateInput`       | ISO date, "2026-10-09" | `""`        |
// | `SelectInput`     | one option id          | `null`      |
// | `ComboboxInput`   | one option id          | `null`      |
// | `RadioInput`      | one option id          | `null`      |
// | `NumberInput`     | number                 | `undefined` |
// | `CheckboxesInput` | option ids             | `[]`        |
// | `SwitchInput`     | boolean                | `false`     |
import type { FieldValues } from "react-hook-form";
import { CheckboxesInput } from "./CheckboxesInput";
import { ComboboxInput } from "./ComboboxInput";
import { DateInput } from "./DateInput";
import { NumberInput } from "./NumberInput";
import { RadioInput } from "./RadioInput";
import { SelectInput } from "./SelectInput";
import { SwitchInput } from "./SwitchInput";
import { TextAreaInput } from "./TextAreaInput";
import { TextInput } from "./TextInput";

export type { Option } from "./props";

/**
 * The bindings, typed for one form's values:
 *
 * ```tsx
 * const { TextInput, SelectInput } = fieldsFor<Values>();
 * <TextInput name="name" label="Name" isRequired />
 * ```
 *
 * The form's values type each binding's `name`, so a binding only accepts
 * a field holding its value type, a typo in a name fails the build, and no
 * `control` prop is needed. The bindings are the same components for every
 * form; only their types differ.
 */
export function fieldsFor<T extends FieldValues>() {
  return {
    CheckboxesInput: CheckboxesInput<T>,
    ComboboxInput: ComboboxInput<T>,
    DateInput: DateInput<T>,
    NumberInput: NumberInput<T>,
    RadioInput: RadioInput<T>,
    SelectInput: SelectInput<T>,
    SwitchInput: SwitchInput<T>,
    TextAreaInput: TextAreaInput<T>,
    TextInput: TextInput<T>,
  };
}
