import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { renderInForm } from "../../../test/renderInForm";
import { ComboboxInput } from "./ComboboxInput";

const schema = z.object({
  parameter: z.string().min(1, "Choose a parameter"),
});
const options = [
  { id: "max_connections", label: "max_connections" },
  { id: "wait_timeout", label: "wait_timeout" },
];

describe("ComboboxInput", () => {
  it("is labelled, described by its help text, and by its message once invalid", async () => {
    const { submit } = renderInForm(
      <ComboboxInput<z.infer<typeof schema>>
        name="parameter"
        label="Parameter"
        description="Type to narrow the list."
        options={options}
      />,
      { schema, defaultValues: { parameter: "" } },
    );
    const input = screen.getByRole("combobox", { name: "Parameter" });
    expect(input).toHaveAccessibleDescription("Type to narrow the list.");

    await submit();

    expect(input).toHaveAccessibleDescription(
      "Type to narrow the list. Choose a parameter",
    );
  });

  it("chooses the option the user picks from the filtered list", async () => {
    const { user, submit } = renderInForm(
      <ComboboxInput<z.infer<typeof schema>>
        name="parameter"
        label="Parameter"
        options={options}
      />,
      { schema, defaultValues: { parameter: "" } },
    );
    const input = screen.getByRole("combobox", { name: "Parameter" });

    await user.type(input, "wait");
    expect(screen.queryByRole("option", { name: "max_connections" })).toBe(
      null,
    );
    await user.click(screen.getByRole("option", { name: "wait_timeout" }));
    await submit();

    expect(input).toHaveValue("wait_timeout");
    expect(input).not.toHaveAccessibleDescription(/Choose a parameter/);
  });
});
