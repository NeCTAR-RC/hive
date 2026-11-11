import { Combobox, ComboboxItem } from "@ardc-ui/react";
import type { FieldValues } from "react-hook-form";
import { fieldChrome } from "./fieldChrome";
import type { BindingProps, ChoiceProps } from "./props";
import { useBoundField } from "./useBoundField";

export interface ComboboxInputProps<T extends FieldValues>
  extends BindingProps<T, string | null | undefined>, ChoiceProps {
  placeholder?: string;
}

/**
 * A single choice from a long list the user narrows by typing: the
 * `SelectInput` value (one option id, nothing chosen is `null`) on the
 * library `Combobox`. Typed text that matches no option chooses nothing.
 */
export function ComboboxInput<T extends FieldValues = never>({
  name,
  label,
  description,
  isRequired,
  isDisabled,
  options,
  placeholder,
  onValueChange,
}: ComboboxInputProps<T>) {
  const { value, onChange, fieldProps, errorMessage } = useBoundField<T>(name);
  const chrome = fieldChrome({ label, description, errorMessage });
  return (
    <Combobox
      {...fieldProps}
      selectedKey={typeof value === "string" ? value : null}
      onSelectionChange={(key) => {
        onChange(key === null ? null : String(key));
        if (key !== null) onValueChange?.(String(key));
      }}
      isRequired={isRequired}
      isDisabled={isDisabled}
      disabledKeys={options.filter((o) => o.isDisabled).map((o) => o.id)}
      placeholder={placeholder}
    >
      {chrome.label}
      {chrome.description}
      {options.map((option) => (
        <ComboboxItem key={option.id} id={option.id} textValue={option.label}>
          {option.label}
        </ComboboxItem>
      ))}
      {chrome.error}
    </Combobox>
  );
}
