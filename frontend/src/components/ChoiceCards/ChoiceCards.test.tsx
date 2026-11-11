import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChoiceCards } from "./ChoiceCards";

const options = [
  {
    id: "standard-v3",
    title: "Balanced (m3)",
    meta: "6 flavours, from 0.03 SU/hour",
    description: "Suited to most workloads.",
  },
  { id: "tiny-v3", title: "Tiny (t3)", meta: "3 flavours" },
  { id: "other", title: "Other", meta: "12 flavours", description: null },
];

describe("ChoiceCards", () => {
  it("offers every option as a radio card and reports the choice", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ChoiceCards
        aria-label="Flavour class"
        options={options}
        value="standard-v3"
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole("radiogroup", { name: "Flavour class" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /Balanced/ })).toBeChecked();
    expect(screen.getByText("Suited to most workloads.")).toBeVisible();

    // The card itself is the label, so its text is the click target.
    await user.click(screen.getByText("Tiny (t3)"));
    expect(onChange).toHaveBeenCalledWith("tiny-v3");
  });

  it("moves the choice with the arrow keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ChoiceCards
        aria-label="Flavour class"
        options={options}
        value="standard-v3"
        onChange={onChange}
      />,
    );
    await user.tab();
    expect(screen.getByRole("radio", { name: /Balanced/ })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("tiny-v3");
  });

  it("chooses nothing for an empty value", () => {
    render(
      <ChoiceCards
        aria-label="Flavour class"
        options={options}
        value=""
        onChange={() => {}}
      />,
    );
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).not.toBeChecked();
    }
  });
});
