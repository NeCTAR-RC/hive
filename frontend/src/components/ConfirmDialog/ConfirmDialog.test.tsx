import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { stubResizeObserver } from "../testing/resizeObserver";
import { ConfirmDialog } from "./ConfirmDialog";

function dialog(isOpen: boolean, isPending = false) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={() => {}}
      title="Delete volume"
      confirmLabel="Delete"
      confirmText="data"
      onConfirm={() => {}}
      isPending={isPending}
    />
  );
}

describe("ConfirmDialog", () => {
  beforeAll(stubResizeObserver);

  it("clears the typed confirmation when the parent closes it", async () => {
    const user = userEvent.setup();
    const { rerender } = render(dialog(true));
    await user.type(screen.getByRole("textbox"), "data");
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();

    rerender(dialog(false));
    rerender(dialog(true));
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("keeps one confirm button while pending", async () => {
    const user = userEvent.setup();
    const { rerender } = render(dialog(true));
    await user.type(screen.getByRole("textbox"), "data");
    const button = screen.getByRole("button", { name: "Delete" });
    button.focus();

    rerender(dialog(true, true));
    expect(button).toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-disabled", "true");
  });
});
