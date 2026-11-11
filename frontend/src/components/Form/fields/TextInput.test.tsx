import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { renderInForm } from "../../../test/renderInForm";
import { TextInput } from "./TextInput";

const schema = z.object({ name: z.string().min(1, "Enter a name") });

describe("TextInput", () => {
  it("is labelled, described by its help text, and by its message once invalid", async () => {
    const { submit } = renderInForm(
      <TextInput<z.infer<typeof schema>>
        name="name"
        label="Name"
        description="Shown in lists."
      />,
      { schema, defaultValues: { name: "" } },
    );
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input).toHaveAccessibleDescription("Shown in lists.");

    await submit();

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Shown in lists. Enter a name");
  });
});
