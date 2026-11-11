import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TemplateStep } from "./TemplateStep";

function step(isPending: boolean) {
  return (
    <TemplateStep isPending={isPending} error={null} onValidate={vi.fn()} />
  );
}

describe("TemplateStep", () => {
  it("keeps the same focused button while the template validates", () => {
    const { rerender } = render(step(false));
    const next = screen.getByRole("button", { name: "Next" });
    next.focus();

    rerender(step(true));

    const busy = screen.getByRole("button", { name: /Validating/ });
    expect(busy).toBe(next);
    expect(busy).toHaveFocus();
    expect(busy).not.toBeDisabled();
  });

  it("goes back to Next once the answer arrives", () => {
    const { rerender } = render(step(true));
    rerender(step(false));
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });
});
