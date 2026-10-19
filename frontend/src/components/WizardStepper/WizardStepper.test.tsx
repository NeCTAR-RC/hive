import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StepItem, Stepper } from "./WizardStepper";

function Wizard({
  allowsJumping,
  onChange = () => {},
}: {
  allowsJumping: boolean | "any";
  onChange?: (key: React.Key) => void;
}) {
  return (
    <Stepper
      activeStep="two"
      allowsJumping={allowsJumping}
      onActiveStepChange={onChange}
      statusLabels={{ pending: "(incomplete)", invalid: "(has errors)" }}
      aria-label="Steps"
    >
      <StepItem id="one" title="One" status="invalid">
        <p>Panel one</p>
      </StepItem>
      <StepItem id="two" title="Two">
        <p>Panel two</p>
      </StepItem>
      <StepItem id="three" title="Three" status="pending" description="Soon">
        <p>Panel three</p>
      </StepItem>
    </Stepper>
  );
}

describe("WizardStepper", () => {
  it("makes every other step pressable with allowsJumping any", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Wizard allowsJumping="any" onChange={onChange} />);

    const list = screen.getByRole("list", { name: "Steps" });
    const steps = list.querySelectorAll("li");
    expect(steps[0]).toHaveAttribute("data-state", "complete");
    expect(steps[0]).toHaveAttribute("data-status", "invalid");
    expect(steps[1]).toHaveAttribute("aria-current", "step");
    expect(steps[1]).not.toHaveAttribute("data-status");
    expect(steps[2]).toHaveAttribute("data-state", "upcoming");
    expect(steps[2]).toHaveAttribute("data-status", "pending");

    // The status words are part of the step's accessible name (jsdom
    // joins the spans without a space; a browser adds one).
    expect(
      screen.getByRole("button", { name: /^One\s*\(has errors\)$/ }),
    ).toBeInTheDocument();
    const ahead = screen.getByRole("button", {
      name: /^Three\s*\(incomplete\)\s*Soon$/,
    });
    expect(screen.queryByRole("button", { name: /Two/ })).toBeNull();

    // Only the active panel is mounted.
    expect(screen.getByRole("group", { name: "Two" })).toHaveTextContent(
      "Panel two",
    );
    expect(screen.queryByText("Panel one")).toBeNull();

    await user.click(ahead);
    expect(onChange).toHaveBeenCalledWith("three");
  });

  it("keeps upcoming steps unpressable with allowsJumping true", () => {
    render(<Wizard allowsJumping />);
    expect(
      screen.getByRole("button", { name: /^One\s*\(has errors\)$/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Three/ })).toBeNull();
  });

  it("renders no buttons without jumping", () => {
    render(<Wizard allowsJumping={false} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("One")).toBeInTheDocument();
  });

  it("refuses a StepItem rendered on its own", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<StepItem id="x" title="X" />)).toThrow(/data carrier/);
    spy.mockRestore();
  });
});
