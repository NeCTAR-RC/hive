import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChartFigure } from "./ChartFigure";

describe("ChartFigure", () => {
  it("offers the data as a table", async () => {
    const user = userEvent.setup();
    render(
      <ChartFigure
        title="Daily usage"
        summary="Daily usage, 2 days, 5 in total"
        columns={[
          { id: "date", label: "Date" },
          { id: "value", label: "Service units", numeric: true },
        ]}
        rows={[
          { date: "1 Oct 2026", value: "2" },
          { date: "2 Oct 2026", value: "3" },
        ]}
      >
        <svg data-testid="chart" />
      </ChartFigure>,
    );
    expect(
      screen.getByRole("img", { name: "Daily usage, 2 days, 5 in total" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View as table" }));
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Service units" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "2 Oct 2026" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "3" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "View as chart" }));
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });
});
