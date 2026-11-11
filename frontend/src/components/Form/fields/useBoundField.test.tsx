import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Form } from "../Form";
import { TextInput } from "./TextInput";

const schema = z.object({ name: z.string().min(1, "Enter a name") });
type Values = z.infer<typeof schema>;

/**
 * A form as a wizard drives it: "Check" validates the field without a
 * submit (Next), "Fill" sets its value from code (a preselection), and
 * "Server error" marks it as a 422 would.
 */
function Harness() {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { name: "" },
  });
  return (
    <Form form={form} onValid={() => undefined}>
      <TextInput<Values> name="name" label="Name" />
      <button type="button" onClick={() => void form.trigger("name")}>
        Check
      </button>
      <button type="button" onClick={() => form.setValue("name", "web")}>
        Fill
      </button>
      <button
        type="button"
        onClick={() =>
          form.setError("name", { message: "The name is already taken" })
        }
      >
        Server error
      </button>
    </Form>
  );
}

describe("a bound field", () => {
  it("clears its message as soon as the form fills it with a valid value", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Enter a name")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fill" }));

    await waitFor(() =>
      expect(screen.queryByText("Enter a name")).not.toBeInTheDocument(),
    );
  });

  it("keeps a server's message until the value changes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Fill" }));
    await user.click(screen.getByRole("button", { name: "Server error" }));
    expect(
      await screen.findByText("The name is already taken"),
    ).toBeInTheDocument();
    // Long enough for a stray re-check to have cleared it.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText("The name is already taken")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Name" }), "-2");

    await waitFor(() =>
      expect(
        screen.queryByText("The name is already taken"),
      ).not.toBeInTheDocument(),
    );
  });
});
