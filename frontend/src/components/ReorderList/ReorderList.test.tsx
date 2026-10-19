import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReorderList } from "./ReorderList";

const items = [
  { id: "classic", label: "classic" },
  { id: "private", label: "my-net" },
  { id: "shared", label: "qh2-shared" },
];

// The drag and drop itself is React Aria's and needs a real layout, so the
// Playwright suite drives it; here the list's shape and names are checked.
describe("ReorderList", () => {
  it("numbers the rows and gives each one a named drag handle", () => {
    render(
      <ReorderList items={items} onReorder={() => {}} aria-label="Order" />,
    );
    const list = screen.getByRole("grid", { name: "Order" });
    expect(list).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(/1\s*classic/);
    expect(rows[2]).toHaveTextContent(/3\s*qh2-shared/);
    expect(
      screen.getByRole("button", { name: "Drag my-net" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Drag / })).toHaveLength(3);
  });
});
