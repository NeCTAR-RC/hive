import { TextArea } from "@ardc-ui/react";
import type { FieldValues } from "react-hook-form";
import { fieldChrome } from "./fieldChrome";
import type { BindingProps } from "./props";
import { useBoundField } from "./useBoundField";

export interface TextAreaInputProps<T extends FieldValues> extends BindingProps<
  T,
  string | null | undefined
> {
  placeholder?: string;
}

/** A multi-line text field. Empty is "". */
export function TextAreaInput<T extends FieldValues = never>({
  name,
  label,
  description,
  isRequired,
  isDisabled,
  placeholder,
}: TextAreaInputProps<T>) {
  const { value, onChange, fieldProps, errorMessage } = useBoundField<T>(name);
  const chrome = fieldChrome({ label, description, errorMessage });
  return (
    <TextArea
      {...fieldProps}
      value={typeof value === "string" ? value : ""}
      onChange={onChange}
      isRequired={isRequired}
      isDisabled={isDisabled}
      placeholder={placeholder}
    >
      {chrome.label}
      {chrome.description}
      {chrome.error}
    </TextArea>
  );
}
