import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { renderInForm } from "../../../test/renderInForm";
import { TextAreaInput } from "./TextAreaInput";

const schema = z.object({ key: z.string().min(1, "Paste the public key") });

describe("TextAreaInput", () => {
  it("is labelled, described by its help text, and by its message once invalid", async () => {
    const { submit } = renderInForm(
      <TextAreaInput<z.infer<typeof schema>>
        name="key"
        label="Public key"
        description="The contents of your .pub file."
      />,
      { schema, defaultValues: { key: "" } },
    );
    const input = screen.getByRole("textbox", { name: "Public key" });
    expect(input).toHaveAccessibleDescription(
      "The contents of your .pub file.",
    );

    await submit();

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "The contents of your .pub file. Paste the public key",
    );
  });
});
