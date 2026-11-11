import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { renderInForm } from "../../../test/renderInForm";
import { CheckboxesInput } from "./CheckboxesInput";

const schema = z.object({
  groups: z.array(z.string()).min(1, "Choose at least one group"),
});
const options = [
  { id: "default", label: "default" },
  { id: "ssh", label: "ssh" },
];

describe("CheckboxesInput", () => {
  it("is labelled, described by its help text, and by its message once invalid", async () => {
    const { submit } = renderInForm(
      <CheckboxesInput<z.infer<typeof schema>>
        name="groups"
        label="Security groups"
        description="Applied to every port."
        options={options}
      />,
      { schema, defaultValues: { groups: [] } },
    );
    const group = screen.getByRole("group", { name: "Security groups" });
    expect(group).toHaveAccessibleDescription("Applied to every port.");

    await submit();

    expect(group).toHaveAccessibleDescription(
      "Applied to every port. Choose at least one group",
    );
  });
});
