import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { renderInForm } from "../../../test/renderInForm";
import { NumberInput } from "./NumberInput";

const schema = z.object({
  size: z.number({ error: "Enter a size" }).min(1, "At least 1 GB"),
});

describe("NumberInput", () => {
  it("is labelled, described by its help text, and by its message once invalid", async () => {
    const { submit } = renderInForm(
      <NumberInput<z.infer<typeof schema>>
        name="size"
        label="Size"
        description="In gigabytes."
      />,
      { schema, defaultValues: { size: undefined } },
    );
    const input = screen.getByRole("textbox", { name: "Size" });
    expect(input).toHaveAccessibleDescription("In gigabytes.");

    await submit();

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("In gigabytes. Enter a size");
  });
});
