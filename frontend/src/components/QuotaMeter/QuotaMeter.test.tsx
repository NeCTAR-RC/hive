import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatMb } from "../../lib/format";
import { QuotaMeter } from "./QuotaMeter";

describe("QuotaMeter", () => {
  it("reads the count against its limit when no text is given", () => {
    render(<QuotaMeter label="Clusters" value={1} max={10} />);
    expect(screen.getByRole("meter", { name: "Clusters" })).toHaveAttribute(
      "aria-valuetext",
      "1 of 10",
    );
  });

  it("says nothing extra well under the limit", () => {
    render(<QuotaMeter label="vCPUs" value={4} max={10} />);
    const meter = screen.getByRole("meter", { name: "vCPUs" });
    expect(meter).not.toHaveAccessibleDescription();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("says how much is used from 80% of the limit", () => {
    render(<QuotaMeter label="vCPUs" value={82} max={100} />);
    expect(
      screen.getByRole("meter", { name: "vCPUs" }),
    ).toHaveAccessibleDescription("82% used");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("calls a full quota used, not over", () => {
    render(<QuotaMeter label="Instances" value={10} max={10} />);
    expect(
      screen.getByRole("meter", { name: "Instances" }),
    ).toHaveAccessibleDescription("100% used");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("says over quota and adds an alert past the limit", () => {
    render(
      <QuotaMeter label="RAM" value={12288} max={10240} format={formatMb} />,
    );
    const meter = screen.getByRole("meter", { name: "RAM" });
    expect(meter).toHaveAccessibleDescription("Over quota");
    expect(meter).toHaveAttribute("aria-valuenow", "10240");
    expect(screen.getByRole("note")).toHaveTextContent(
      "Over quota for RAM: 12 GB of 10 GB.",
    );
  });

  it("shows only the value when the limit is unlimited", () => {
    render(<QuotaMeter label="Volumes" value={3} max={-1} />);
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.getByText("3 (unlimited)")).toBeInTheDocument();
  });

  it("formats the numbers it writes itself", () => {
    const { unmount } = render(
      <QuotaMeter label="Gigabytes" value={1500} max={1200} />,
    );
    expect(screen.getByRole("note")).toHaveTextContent(
      "Over quota for Gigabytes: 1,500 of 1,200.",
    );
    unmount();
    render(<QuotaMeter label="Objects" value={12000} max={null} />);
    expect(screen.getByText("12,000 (unlimited)")).toBeInTheDocument();
  });

  it("writes both figures in the quota's unit", () => {
    render(
      <QuotaMeter label="RAM" value={4096} max={51200} format={formatMb} />,
    );
    expect(screen.getByRole("meter", { name: "RAM" })).toHaveAttribute(
      "aria-valuetext",
      "4 GB of 50 GB",
    );
  });

  it("names what it counts after the figures", () => {
    const { unmount } = render(
      <QuotaMeter label="Shares" value={2} max={10} unit="shares" />,
    );
    expect(screen.getByRole("meter", { name: "Shares" })).toHaveAttribute(
      "aria-valuetext",
      "2 of 10 shares",
    );
    unmount();
    render(<QuotaMeter label="Storage" value={512} max={null} unit="GiB" />);
    expect(screen.getByText("512 GiB (unlimited)")).toBeInTheDocument();
  });

  it("writes an unlimited value in the quota's unit", () => {
    render(<QuotaMeter label="RAM" value={512} max={-1} format={formatMb} />);
    expect(screen.getByText("512 MB (unlimited)")).toBeInTheDocument();
  });
});
