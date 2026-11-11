import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyIconButton } from "./CopyIconButton";

afterEach(() => {
  vi.useRealTimers();
});

describe("CopyIconButton", () => {
  it("keeps its name and announces the copy beside it", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<CopyIconButton text="ssh-ed25519 AAAA" label="Copy Public key" />);

    const button = screen.getByRole("button", { name: "Copy Public key" });
    await user.click(button);

    expect(writeText).toHaveBeenCalledWith("ssh-ed25519 AAAA");
    expect(button).toHaveAccessibleName("Copy Public key");
    expect(button).toHaveAttribute("data-copied", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Copied to clipboard");
  });

  it("returns to its copy state two seconds after the copy", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CopyIconButton text="abc" label="Copy ID" />);

    await user.click(screen.getByRole("button", { name: "Copy ID" }));
    expect(screen.getByRole("button")).toHaveAttribute("data-copied", "true");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    expect(screen.getByRole("button")).not.toHaveAttribute("data-copied");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("is disabled when there is nothing to copy", () => {
    render(<CopyIconButton text="" label="Copy secret" />);
    expect(screen.getByRole("button", { name: "Copy secret" })).toBeDisabled();
  });
});
