import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { renderInForm } from "../../../test/renderInForm";
import { SelectInput } from "./SelectInput";

const schema = z.object({ zone: z.string().min(1, "Choose a zone") });
const options = [
  { id: "melbourne", label: "Melbourne" },
  { id: "monash", label: "Monash" },
];

describe("SelectInput", () => {
  it("is labelled, described by its help text, and by its message once invalid", async () => {
    const { submit } = renderInForm(
      <SelectInput<z.infer<typeof schema>>
        name="zone"
        label="Zone"
        description="Where the volume lives."
        options={options}
      />,
      { schema, defaultValues: { zone: "" } },
    );
    const trigger = screen.getByRole("button", { name: /Zone/ });
    expect(trigger).toHaveAccessibleDescription("Where the volume lives.");

    await submit();

    expect(trigger).toHaveAccessibleDescription(
      "Where the volume lives. Choose a zone",
    );
  });
});
