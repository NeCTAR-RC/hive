import { describe, expect, it } from "vitest";
import { fieldsFor } from ".";
import { TextInput as UntypedTextInput } from "./TextInput";

interface Values {
  name: string;
  size: number | undefined;
  enabled: boolean;
  zone: string | null;
  tags: string[];
  rows: { key: string }[];
}

const {
  CheckboxesInput,
  ComboboxInput,
  DateInput,
  NumberInput,
  SelectInput,
  SwitchInput,
  TextInput,
} = fieldsFor<Values>();

/**
 * Never rendered: `tsc -b` checks these elements through tsconfig.test.json,
 * so a binding that accepts a field of the wrong value type, or a binding
 * used without its form's values type, fails the build.
 */
function bindings(index: number) {
  const options = [{ id: "a", label: "A" }];
  return [
    <TextInput name="name" label="Name" />,
    <TextInput name={`rows.${index}.key`} label="Key" />,
    <NumberInput name="size" label="Size" />,
    <SwitchInput name="enabled" label="Enabled" />,
    <SelectInput name="zone" label="Zone" options={options} />,
    <ComboboxInput name="zone" label="Zone" options={options} />,
    <CheckboxesInput name="tags" label="Tags" options={[]} />,
    <DateInput name="name" label="Date" />,
    // @ts-expect-error a number field cannot bind to a string value
    <NumberInput name="name" label="Name" />,
    // @ts-expect-error a text field cannot bind to a number value
    <TextInput name="size" label="Size" />,
    // @ts-expect-error a switch cannot bind to a string value
    <SwitchInput name="name" label="Name" />,
    // @ts-expect-error a combobox cannot bind to a number value
    <ComboboxInput name="size" label="Size" options={options} />,
    // @ts-expect-error a checkbox list cannot bind to a single choice
    <CheckboxesInput name="zone" label="Zone" options={[]} />,
    // @ts-expect-error a name the form does not have
    <TextInput name="nmae" label="Name" />,
    // @ts-expect-error a binding needs its form's values type
    <UntypedTextInput name="name" label="Name" />,
  ];
}

describe("field bindings", () => {
  it("bind only to fields of their value type", () => {
    expect(bindings).toBeTypeOf("function");
  });
});
