import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import type { DefaultValues, FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Form } from "../components/Form/Form";

/**
 * Renders field bindings inside a `Form` validated by `schema`, with a
 * submit button. `submit()` presses it, so the schema's messages show.
 */
export function renderInForm<T extends FieldValues>(
  fields: ReactElement,
  {
    schema,
    defaultValues,
  }: { schema: z.ZodType<T, T>; defaultValues: DefaultValues<T> },
) {
  function Harness() {
    const form = useForm<T>({ resolver: zodResolver(schema), defaultValues });
    return (
      <Form form={form} onValid={() => undefined}>
        {fields}
        <button type="submit">Submit</button>
      </Form>
    );
  }
  const user = userEvent.setup();
  render(<Harness />);
  return {
    user,
    submit: () => user.click(screen.getByRole("button", { name: "Submit" })),
  };
}
