import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StackedMeter } from "./StackedMeter";

describe("StackedMeter", () => {
  it("reads out the combined value against the limit", () => {
    render(
      <StackedMeter
        label="Total days / Max days"
        used={2}
        pending={5}
        max={20}
        valueText="7 / 20"
      />,
    );
    const meter = screen.getByRole("meter", { name: "Total days / Max days" });
    expect(meter).toHaveAttribute("aria-valuenow", "7");
    expect(meter).toHaveAttribute("aria-valuemax", "20");
    expect(meter).toHaveAttribute("aria-valuetext", "7 / 20");
  });

  it("caps the value at the limit when over", () => {
    render(
      <StackedMeter
        label="SU total / SU budget"
        used={4000}
        pending={2000}
        max={5000}
        valueText="6000 / 5000"
      />,
    );
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "5000");
  });
});
