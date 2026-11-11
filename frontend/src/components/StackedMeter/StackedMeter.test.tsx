import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StackedMeter } from "./StackedMeter";

describe("StackedMeter", () => {
  it("fills to the used share and says what the choice adds", () => {
    render(
      <StackedMeter
        label="Total days / Max days"
        used={2}
        pending={5}
        max={20}
        valueText="7 of 20 days"
      />,
    );
    const meter = screen.getByRole("meter", { name: "Total days / Max days" });
    expect(meter).toHaveAttribute("aria-valuenow", "2");
    expect(meter).toHaveAttribute("aria-valuemax", "20");
    expect(meter).toHaveAccessibleDescription("7 of 20 days with 5 added");
  });

  it("says over the limit when the two together pass it", () => {
    render(
      <StackedMeter
        label="SU total / SU budget"
        used={4000}
        pending={2000.4}
        max={5000}
        valueText="6,000 of 5,000 service units"
      />,
    );
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "4000");
    expect(meter).toHaveAccessibleDescription(
      "6,000 of 5,000 service units with 2,000 added: over the limit",
    );
  });

  it("caps the used share at the limit", () => {
    render(
      <StackedMeter
        label="Total days / Max days"
        used={25}
        pending={0}
        max={20}
        valueText="25 of 20 days"
      />,
    );
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "20");
    expect(meter).toHaveAccessibleDescription("25 of 20 days: over the limit");
  });

  it("reads a limit of zero as full and over", () => {
    render(
      <StackedMeter
        label="SU total / SU budget"
        used={0}
        pending={10}
        max={0}
        valueText="10 of 0 service units"
      />,
    );
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuetext", "100%");
    expect(meter).toHaveAccessibleDescription(
      "10 of 0 service units with 10 added: over the limit",
    );
  });
});
