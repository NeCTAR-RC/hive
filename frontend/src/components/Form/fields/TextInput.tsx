import { TextField } from "@ardc-ui/react";
import type { FieldValues } from "react-hook-form";
import { fieldChrome } from "./fieldChrome";
import type { BindingProps } from "./props";
import { useBoundField } from "./useBoundField";

export interface TextInputProps<T extends FieldValues> extends BindingProps<
  T,
  string | null | undefined
> {
  placeholder?: string;
  type?: "text" | "url" | "email" | "password";
  autoComplete?: string;
  maxLength?: number;
}

/** A one-line text field. Empty is "". */
export function TextInput<T extends FieldValues = never>({
  name,
  label,
  description,
  isRequired,
  isDisabled,
  placeholder,
  type = "text",
  autoComplete,
  maxLength,
}: TextInputProps<T>) {
  const { value, onChange, fieldProps, errorMessage } = useBoundField<T>(name);
  const chrome = fieldChrome({ label, description, errorMessage });
  return (
    <TextField
      {...fieldProps}
      value={typeof value === "string" ? value : ""}
      onChange={onChange}
      isRequired={isRequired}
      isDisabled={isDisabled}
      type={type}
      autoComplete={autoComplete}
      maxLength={maxLength}
      placeholder={placeholder}
    >
      {chrome.label}
      {chrome.description}
      {chrome.error}
    </TextField>
  );
}
