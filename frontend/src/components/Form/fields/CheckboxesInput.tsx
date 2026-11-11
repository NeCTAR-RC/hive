import type { ReactNode } from "react";
import { CheckboxGroup, CheckboxGroupItem } from "@ardc-ui/react";
import type { FieldValues } from "react-hook-form";
import styles from "./CheckboxesInput.module.scss";
import { fieldChrome } from "./fieldChrome";
import type { BindingProps, Option } from "./props";
import { useBoundField } from "./useBoundField";

export interface CheckboxesInputProps<
  T extends FieldValues,
> extends BindingProps<T, string[] | undefined> {
  options: Option[];
  /**
   * More about an option, under its checkbox and in line with its label
   * (a security group's rules). It sits outside the checkbox's label, so
   * it may hold controls of its own.
   */
  details?: (option: Option) => ReactNode;
}

/** Any number of choices from a list. Nothing chosen is `[]`. */
export function CheckboxesInput<T extends FieldValues = never>({
  name,
  label,
  description,
  isRequired,
  isDisabled,
  options,
  details,
}: CheckboxesInputProps<T>) {
  const { value, onChange, fieldProps, errorMessage } = useBoundField<T>(name);
  const chrome = fieldChrome({ label, description, errorMessage });
  return (
    <CheckboxGroup
      {...fieldProps}
      value={Array.isArray(value) ? value : []}
      onChange={onChange}
      isRequired={isRequired}
      isDisabled={isDisabled}
    >
      {chrome.label}
      {chrome.description}
      {options.map((option) => {
        const item = (
          <CheckboxGroupItem
            key={option.id}
            value={option.id}
            isDisabled={option.isDisabled}
          >
            {option.label}
          </CheckboxGroupItem>
        );
        if (!details) return item;
        return (
          <div key={option.id} className={styles.option}>
            {item}
            <div className={styles.details}>{details(option)}</div>
          </div>
        );
      })}
      {chrome.error}
    </CheckboxGroup>
  );
}
