import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog";

const props: ConfirmDialogProps = {
  isOpen: true,
  onOpenChange: vi.fn(),
  title: "Delete volume data-01?",
  confirmLabel: "Delete",
  onConfirm: vi.fn(),
};

describe("ConfirmDialog", () => {
  it("confirms at once, without asking for the name", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...props} onConfirm={onConfirm} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("keeps focus on the one action button while it runs", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <ConfirmDialog {...props} onConfirm={onConfirm} />,
    );
    const action = screen.getByRole("button", { name: "Delete" });
    action.focus();
    rerender(<ConfirmDialog {...props} onConfirm={onConfirm} isPending />);
    expect(action).toHaveFocus();
    expect(action).toHaveAttribute("aria-disabled", "true");
    await user.click(action);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("ignores Cancel while the action is running", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ConfirmDialog {...props} onOpenChange={onOpenChange} isPending />);
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
