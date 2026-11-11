import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./CopyButton";

afterEach(() => {
  vi.useRealTimers();
});

describe("CopyButton", () => {
  it("keeps its name short and announces the copy beside it", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<CopyButton text="ssh-ed25519 AAAA" />);

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith("ssh-ed25519 AAAA");
    expect(screen.getByRole("button")).toHaveAccessibleName("Copied");
    expect(screen.getByRole("status")).toHaveTextContent("Copied to clipboard");
  });

  it("returns to its label two seconds after the last copy", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CopyButton text="abc" label="Copy ID" />);

    await user.click(screen.getByRole("button", { name: "Copy ID" }));
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    await user.click(screen.getByRole("button", { name: "Copied" }));
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole("button")).toHaveAccessibleName("Copied");

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole("button")).toHaveAccessibleName("Copy ID");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
