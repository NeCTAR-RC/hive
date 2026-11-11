import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { renderInForm } from "../../../test/renderInForm";
import { SwitchInput } from "./SwitchInput";

const schema = z.object({ shared: z.boolean() });

describe("SwitchInput", () => {
  it("is labelled by its text and holds a boolean", async () => {
    const { user } = renderInForm(
      <SwitchInput<z.infer<typeof schema>> name="shared" label="Shared" />,
      { schema, defaultValues: { shared: false } },
    );
    const control = screen.getByRole("switch", { name: "Shared" });
    expect(control).not.toBeChecked();
    await user.click(control);
    expect(control).toBeChecked();
  });
});
