import type { FieldPathByValue, FieldValues } from "react-hook-form";

/**
 * The props every binding takes. `T` is the form's values and `V` the value
 * type the binding edits, so a binding only accepts the name of a field
 * holding that type (a number field cannot bind to a string).
 */
export interface BindingProps<T extends FieldValues, V> {
  /** A field whose value is a `V`. */
  name: NoInfer<FieldPathByValue<T, V>>;
  label: string;
  /** Help text under the label, announced with the field. */
  description?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
}

/** One choice of a select, radio group or checkbox list. */
export interface Option {
  id: string;
  label: string;
  description?: string;
  isDisabled?: boolean;
}

/**
 * Props of a field whose choice other fields depend on. `onValueChange`
 * runs after the user picks a value, so a form can clear or default the
 * dependent fields in the change itself rather than in an effect.
 */
export interface ChoiceProps {
  options: Option[];
  onValueChange?: (value: string) => void;
}
