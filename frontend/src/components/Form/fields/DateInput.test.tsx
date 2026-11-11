import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { renderInForm } from "../../../test/renderInForm";
import { DateInput } from "./DateInput";

const schema = z.object({ end: z.string().min(1, "Choose an end date") });

describe("DateInput", () => {
  it("is labelled, described by its help text, and by its message once invalid", async () => {
    const { submit } = renderInForm(
      <DateInput<z.infer<typeof schema>>
        name="end"
        label="End date"
        description="The last day of the lease."
      />,
      { schema, defaultValues: { end: "" } },
    );
    const group = screen.getByRole("group", { name: "End date" });
    expect(group).toHaveAccessibleDescription("The last day of the lease.");

    await submit();

    expect(group).toHaveAccessibleDescription(
      "The last day of the lease. Choose an end date",
    );
  });
});
