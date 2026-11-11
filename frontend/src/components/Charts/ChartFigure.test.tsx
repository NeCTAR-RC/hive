import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChartFigure, TABLE_PAGE_SIZE } from "./ChartFigure";

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
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View as table" }));
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Service units" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "2 Oct 2026" })).toBeVisible();
    // The library Table is a React Aria grid: its cells are grid cells.
    expect(screen.getByRole("gridcell", { name: "3" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "View as chart" }));
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });

  it("pages a long series in the table view", async () => {
    const user = userEvent.setup();
    const days = TABLE_PAGE_SIZE * 2 + 5;
    render(
      <ChartFigure
        title="Daily usage"
        summary={`Daily usage, ${days} days`}
        columns={[
          { id: "date", label: "Date" },
          { id: "value", label: "Service units", numeric: true },
        ]}
        rows={Array.from({ length: days }, (_, day) => ({
          date: `Day ${day + 1}`,
          value: String(day),
        }))}
      >
        <svg />
      </ChartFigure>,
    );
    await user.click(screen.getByRole("button", { name: "View as table" }));
    // One header row and a page of rows.
    expect(screen.getAllByRole("row")).toHaveLength(TABLE_PAGE_SIZE + 1);
    expect(screen.getByRole("rowheader", { name: "Day 1" })).toBeVisible();
    expect(
      screen.queryByRole("rowheader", { name: `Day ${TABLE_PAGE_SIZE + 1}` }),
    ).not.toBeInTheDocument();

    // The library pager's arrows are links.
    await user.click(screen.getByRole("link", { name: "Next page" }));
    expect(
      screen.getByRole("rowheader", { name: `Day ${TABLE_PAGE_SIZE + 1}` }),
    ).toBeVisible();
  });
});
