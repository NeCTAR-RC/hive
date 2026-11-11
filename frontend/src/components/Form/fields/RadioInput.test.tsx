import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { renderInForm } from "../../../test/renderInForm";
import { RadioInput } from "./RadioInput";

const schema = z.object({ mode: z.string().min(1, "Choose how to attach") });
const options = [
  { id: "network", label: "Network" },
  { id: "port", label: "Existing port" },
];

describe("RadioInput", () => {
  it("is labelled, described by its help text, and by its message once invalid", async () => {
    const { submit } = renderInForm(
      <RadioInput<z.infer<typeof schema>>
        name="mode"
        label="Attach by"
        description="A network creates a new port."
        options={options}
      />,
      { schema, defaultValues: { mode: "" } },
    );
    const group = screen.getByRole("radiogroup", { name: "Attach by" });
    expect(group).toHaveAccessibleDescription("A network creates a new port.");

    await submit();

    expect(group).toHaveAccessibleDescription(
      "A network creates a new port. Choose how to attach",
    );
  });
});
