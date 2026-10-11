// react-hook-form bindings for the design system's fields. Each one wires
// a Controller onto the field's value, change and blur, and renders the
// label, description and validation message in the design system's slots.
import { Controller } from "react-hook-form";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { parseDate } from "@internationalized/date";
import {
  CheckboxGroup,
  CheckboxGroupItem,
  DatePicker,
  FieldError,
  Label,
  NumberField,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectItem,
  Switch,
  Text,
  TextArea,
  TextField,
} from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";

interface BaseProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  className?: string;
}

export interface Option {
  id: string;
  label: string;
  description?: string;
  isDisabled?: boolean;
}

export function TextInput<T extends FieldValues>({
  control,
  name,
  label,
  description,
  isRequired,
  isDisabled,
  className,
  placeholder,
  type = "text",
  autoComplete,
  maxLength,
}: BaseProps<T> & {
  placeholder?: string;
  type?: "text" | "url" | "email" | "password";
  autoComplete?: string;
  maxLength?: number;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          name={field.name}
          value={
            field.value === undefined || field.value === null
              ? ""
              : String(field.value)
          }
          onChange={field.onChange}
          onBlur={field.onBlur}
          isInvalid={fieldState.invalid}
          isRequired={isRequired ?? false}
          isDisabled={isDisabled ?? false}
          validationBehavior="aria"
          type={type}
          {...(autoComplete ? { autoComplete } : {})}
          {...(maxLength ? { maxLength } : {})}
          {...(placeholder ? { placeholder } : {})}
          {...(className ? { className } : {})}
        >
          <Label>{label}</Label>
          {description && <Text slot="description">{description}</Text>}
          <FieldError>{fieldState.error?.message}</FieldError>
        </TextField>
      )}
    />
  );
}

export function TextAreaInput<T extends FieldValues>({
  control,
  name,
  label,
  description,
  isRequired,
  isDisabled,
  className,
  placeholder,
  rows,
  monospace,
}: BaseProps<T> & {
  placeholder?: string;
  rows?: number;
  monospace?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextArea
          name={field.name}
          value={
            field.value === undefined || field.value === null
              ? ""
              : String(field.value)
          }
          onChange={field.onChange}
          onBlur={field.onBlur}
          isInvalid={fieldState.invalid}
          isRequired={isRequired ?? false}
          isDisabled={isDisabled ?? false}
          validationBehavior="aria"
          {...(placeholder ? { placeholder } : {})}
          {...(className ? { className } : {})}
          {...(rows ? { rows } : {})}
          {...(monospace
            ? { style: { fontFamily: "var(--hive-font-mono)" } }
            : {})}
        >
          <Label>{label}</Label>
          {description && <Text slot="description">{description}</Text>}
          <FieldError>{fieldState.error?.message}</FieldError>
        </TextArea>
      )}
    />
  );
}

export function NumberInput<T extends FieldValues>({
  control,
  name,
  label,
  description,
  isRequired,
  isDisabled,
  className,
  minValue,
  maxValue,
  step,
  addon,
}: BaseProps<T> & {
  minValue?: number;
  maxValue?: number;
  step?: number;
  addon?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <NumberField
          name={field.name}
          value={typeof field.value === "number" ? field.value : NaN}
          onChange={(value) =>
            field.onChange(Number.isNaN(value) ? undefined : value)
          }
          onBlur={field.onBlur}
          isInvalid={fieldState.invalid}
          isRequired={isRequired ?? false}
          isDisabled={isDisabled ?? false}
          validationBehavior="aria"
          {...(minValue !== undefined ? { minValue } : {})}
          {...(maxValue !== undefined ? { maxValue } : {})}
          {...(step !== undefined ? { step } : {})}
          {...(addon ? { addon } : {})}
          {...(className ? { className } : {})}
        >
          <Label>{label}</Label>
          {description && <Text slot="description">{description}</Text>}
          <FieldError>{fieldState.error?.message}</FieldError>
        </NumberField>
      )}
    />
  );
}

export function SelectInput<T extends FieldValues>({
  control,
  name,
  label,
  description,
  isRequired,
  isDisabled,
  className,
  options,
  placeholder,
}: BaseProps<T> & { options: Option[]; placeholder?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Select
          name={field.name}
          selectedKey={(field.value as Key | null | undefined) ?? null}
          onSelectionChange={(key) =>
            field.onChange(key === null ? null : String(key))
          }
          onBlur={field.onBlur}
          isInvalid={fieldState.invalid}
          isRequired={isRequired ?? false}
          isDisabled={isDisabled ?? false}
          validationBehavior="aria"
          disabledKeys={options.filter((o) => o.isDisabled).map((o) => o.id)}
          {...(placeholder ? { placeholder } : {})}
          {...(className ? { className } : {})}
        >
          <Label>{label}</Label>
          {description && <Text slot="description">{description}</Text>}
          {options.map((option) => (
            <SelectItem key={option.id} id={option.id} textValue={option.label}>
              {option.label}
            </SelectItem>
          ))}
          <FieldError>{fieldState.error?.message}</FieldError>
        </Select>
      )}
    />
  );
}

export function RadioInput<T extends FieldValues>({
  control,
  name,
  label,
  description,
  isRequired,
  isDisabled,
  className,
  options,
}: BaseProps<T> & { options: Option[] }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <RadioGroup
          name={field.name}
          value={(field.value as string | null | undefined) ?? null}
          onChange={field.onChange}
          onBlur={field.onBlur}
          isInvalid={fieldState.invalid}
          isRequired={isRequired ?? false}
          isDisabled={isDisabled ?? false}
          validationBehavior="aria"
          {...(className ? { className } : {})}
        >
          <Label>{label}</Label>
          {description && <Text slot="description">{description}</Text>}
          {options.map((option) => (
            <RadioGroupItem
              key={option.id}
              value={option.id}
              isDisabled={option.isDisabled ?? false}
            >
              {option.label}
            </RadioGroupItem>
          ))}
          <FieldError>{fieldState.error?.message}</FieldError>
        </RadioGroup>
      )}
    />
  );
}

export function CheckboxesInput<T extends FieldValues>({
  control,
  name,
  label,
  description,
  isRequired,
  isDisabled,
  className,
  options,
}: BaseProps<T> & { options: Option[] }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <CheckboxGroup
          name={field.name}
          value={(field.value as string[] | undefined) ?? []}
          onChange={field.onChange}
          onBlur={field.onBlur}
          isInvalid={fieldState.invalid}
          isRequired={isRequired ?? false}
          isDisabled={isDisabled ?? false}
          validationBehavior="aria"
          {...(className ? { className } : {})}
        >
          <Label>{label}</Label>
          {description && <Text slot="description">{description}</Text>}
          {options.map((option) => (
            <CheckboxGroupItem
              key={option.id}
              value={option.id}
              isDisabled={option.isDisabled ?? false}
            >
              {option.label}
            </CheckboxGroupItem>
          ))}
          <FieldError>{fieldState.error?.message}</FieldError>
        </CheckboxGroup>
      )}
    />
  );
}

export function SwitchInput<T extends FieldValues>({
  control,
  name,
  label,
  isDisabled,
  className,
}: Omit<BaseProps<T>, "description" | "isRequired">) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Switch
          name={field.name}
          isSelected={Boolean(field.value)}
          onChange={field.onChange}
          onBlur={field.onBlur}
          isDisabled={isDisabled ?? false}
          {...(className ? { className } : {})}
        >
          {label}
        </Switch>
      )}
    />
  );
}

export function DateInput<T extends FieldValues>({
  control,
  name,
  label,
  description,
  isRequired,
  isDisabled,
  className,
  minValue,
  maxValue,
}: BaseProps<T> & {
  /** ISO dates, "2026-10-09". */
  minValue?: string;
  maxValue?: string;
}) {
  const toDate = (value: string | undefined) => {
    if (!value) return undefined;
    try {
      return parseDate(value);
    } catch {
      return undefined;
    }
  };
  const min = toDate(minValue);
  const max = toDate(maxValue);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <DatePicker
          name={field.name}
          value={toDate(field.value as string | undefined) ?? null}
          onChange={(value) => field.onChange(value ? value.toString() : "")}
          onBlur={field.onBlur}
          isInvalid={fieldState.invalid}
          isRequired={isRequired ?? false}
          isDisabled={isDisabled ?? false}
          validationBehavior="aria"
          granularity="day"
          {...(min ? { minValue: min } : {})}
          {...(max ? { maxValue: max } : {})}
          {...(className ? { className } : {})}
        >
          <Label>{label}</Label>
          {description && <Text slot="description">{description}</Text>}
          <FieldError>{fieldState.error?.message}</FieldError>
        </DatePicker>
      )}
    />
  );
}
