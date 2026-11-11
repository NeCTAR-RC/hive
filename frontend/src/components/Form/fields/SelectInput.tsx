import { Select, SelectItem } from "@ardc-ui/react";
import type { FieldValues } from "react-hook-form";
import { fieldChrome } from "./fieldChrome";
import type { BindingProps, ChoiceProps } from "./props";
import { useBoundField } from "./useBoundField";

export interface SelectInputProps<T extends FieldValues>
  extends BindingProps<T, string | null | undefined>, ChoiceProps {
  placeholder?: string;
}

/** A single choice from a drop-down list. Nothing chosen is `null`. */
export function SelectInput<T extends FieldValues = never>({
  name,
  label,
  description,
  isRequired,
  isDisabled,
  options,
  placeholder,
  onValueChange,
}: SelectInputProps<T>) {
  const { value, onChange, fieldProps, errorMessage } = useBoundField<T>(name);
  const chrome = fieldChrome({ label, description, errorMessage });
  return (
    <Select
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
        <SelectItem key={option.id} id={option.id} textValue={option.label}>
          {option.label}
        </SelectItem>
      ))}
      {chrome.error}
    </Select>
  );
}
