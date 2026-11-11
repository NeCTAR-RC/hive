import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataTable, type ColumnDef, type DataTableProps } from "./DataTable";

interface Volume {
  id: string;
  name: string;
}

const columns: ColumnDef<Volume>[] = [
  { id: "name", label: "Name", cell: (row) => row.name, isRowHeader: true },
];

const volumes: Volume[] = Array.from({ length: 25 }, (_, index) => ({
  id: `v${index + 1}`,
  name: `volume-${index + 1}`,
}));

const getRowId = (row: Volume) => row.id;

function renderTable(props: Partial<DataTableProps<Volume>> = {}) {
  const all: DataTableProps<Volume> = {
    id: "test-volumes",
    label: "Volumes",
    columns,
    rows: volumes,
    getRowId,
    emptyTitle: "No volumes yet",
    ...props,
  };
  const view = render(<DataTable {...all} />);
  return {
    ...view,
    rerenderWith: (next: Partial<DataTableProps<Volume>>) =>
      view.rerender(<DataTable {...all} {...next} />),
  };
}

const liveRegion = () =>
  screen
    .getAllByRole("status")
    .find((element) => element.textContent.startsWith("Showing"));

beforeEach(() => {
  window.localStorage.clear();
});

describe("DataTable columns", () => {
  it("rebuilds the rows when the column set changes", () => {
    const { rerenderWith } = renderTable();
    expect(screen.getAllByRole("columnheader")).toHaveLength(1);
    rerenderWith({
      columns: [...columns, { id: "id", label: "ID", cell: (row) => row.id }],
    });
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    const [, firstRow] = screen.getAllByRole("row");
    expect(firstRow && within(firstRow).getAllByRole("rowheader")).toHaveLength(
      1,
    );
    expect(firstRow && within(firstRow).getAllByRole("gridcell")).toHaveLength(
      1,
    );
  });

  it("shows a column added since the choice was stored", () => {
    window.localStorage.setItem(
      "hive.table.test-volumes.columns",
      JSON.stringify({ shown: ["name"], known: ["name"] }),
    );
    renderTable({
      columns: [...columns, { id: "id", label: "ID", cell: (row) => row.id }],
    });
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
  });

  it("ignores a stored value that is not a column choice", () => {
    window.localStorage.setItem("hive.table.test-volumes.columns", '"name"');
    renderTable();
    expect(screen.getAllByRole("columnheader")).toHaveLength(1);
  });
});

describe("DataTable live region", () => {
  it("does not change while a background refetch runs", () => {
    const { rerenderWith } = renderTable();
    expect(liveRegion()).toHaveTextContent("Showing 1 to 20 of 25");
    rerenderWith({ isFetching: true });
    expect(liveRegion()).toHaveTextContent(/^Showing 1 to 20 of 25$/);
  });
});

describe("DataTable errors", () => {
  const failure = new Error("Service unavailable");

  it("keeps cached rows and warns when a refetch fails", () => {
    renderTable({ error: failure, onRetry: vi.fn() });
    expect(screen.getByRole("rowheader", { name: "volume-1" })).toBeVisible();
    expect(
      screen.getByText(
        "Could not refresh the list; showing the last rows loaded",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("replaces the table when there is nothing to show", () => {
    renderTable({ rows: undefined, error: failure });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load the list",
    );
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });
});

describe("DataTable empty and loading states", () => {
  it("says what the table would hold in its own empty cell", () => {
    renderTable({
      rows: [],
      emptyBody: <p>Create a volume to store data.</p>,
    });
    const cell = screen.getByRole("rowheader", { name: /No volumes yet/ });
    expect(cell).toHaveTextContent("No volumes yet");
    expect(cell).toHaveTextContent("Create a volume to store data.");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("shows the library loader in the table while the first load runs", () => {
    renderTable({ rows: undefined, isLoading: true });
    expect(screen.getByText("Loading items...")).toBeInTheDocument();
    expect(
      screen.getAllByRole("status").some((s) => s.textContent === "Loading"),
    ).toBe(true);
  });
});

describe("DataTable filters and search", () => {
  const searchable: ColumnDef<Volume>[] = [
    {
      id: "name",
      label: "Name",
      cell: (row) => row.name,
      isRowHeader: true,
      textValue: (row) => row.name,
    },
  ];
  const search = (value: string) => ({ value, onChange: vi.fn() });
  const emptyBody = <p>Create a volume to store data.</p>;

  it("shows only the rows the filter and the search keep", () => {
    renderTable({
      columns: searchable,
      filter: (row) => row.name.endsWith("1"),
      search: search("volume-2"),
    });
    expect(screen.getByRole("rowheader", { name: "volume-21" })).toBeVisible();
    expect(screen.getAllByRole("rowheader")).toHaveLength(1);
  });

  it("says nothing matches, without the empty body, when rows exist", () => {
    renderTable({
      columns: searchable,
      search: search("backup"),
      noMatchTitle: "No volumes match",
      emptyBody,
    });
    const cell = screen.getByRole("rowheader", { name: /^No volumes match/ });
    expect(cell).not.toHaveTextContent("Create a volume to store data.");
  });

  it("keeps the empty title and body when there are no rows at all", () => {
    renderTable({
      rows: [],
      columns: searchable,
      search: search("backup"),
      noMatchTitle: "No volumes match",
      emptyBody,
    });
    expect(
      screen.getByRole("rowheader", { name: /No volumes yet/ }),
    ).toHaveTextContent("Create a volume to store data.");
  });

  it("shows the rows as given when the query searched on the server", () => {
    renderTable({
      rows: volumes.slice(0, 2),
      columns: searchable,
      search: { ...search("backup"), remote: true },
    });
    expect(screen.getAllByRole("rowheader")).toHaveLength(2);
  });

  it("offers to clear a search that leaves no rows", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderTable({
      columns: searchable,
      search: { value: "backup", onChange },
      noMatchTitle: "No volumes match",
    });
    const cell = screen.getByRole("rowheader", { name: /^No volumes match/ });
    await user.click(
      within(cell).getByRole("button", { name: "Clear search" }),
    );
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveFocus();
  });

  it("returns to the first page when the search text changes", async () => {
    const user = userEvent.setup();
    const { rerenderWith } = renderTable({
      columns: searchable,
      search: search(""),
    });
    await user.click(screen.getByRole("link", { name: "Next page" }));
    expect(liveRegion()).toHaveTextContent("Showing 21 to 25 of 25");
    rerenderWith({ columns: searchable, search: search("volume") });
    expect(liveRegion()).toHaveTextContent("Showing 1 to 20 of 25");
  });
});

describe("DataTable view kept by the page", () => {
  it("shows the page the view names and reports page changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderTable({ view: { value: { page: 2 }, onChange } });
    expect(liveRegion()).toHaveTextContent("Showing 21 to 25 of 25");
    await user.click(screen.getByRole("link", { name: "Previous page" }));
    expect(onChange).toHaveBeenCalledWith({ page: undefined });
  });

  it("returns the view to page one when the search changes", () => {
    const onChange = vi.fn();
    const { rerenderWith } = renderTable({
      view: { value: { page: 2 }, onChange },
      search: { value: "", onChange: vi.fn() },
    });
    expect(onChange).not.toHaveBeenCalled();
    rerenderWith({
      view: { value: { page: 2 }, onChange },
      search: { value: "volume", onChange: vi.fn() },
    });
    expect(onChange).toHaveBeenCalledWith({ page: undefined });
  });

  it("sorts by the view's column", () => {
    renderTable({
      columns: [{ ...columns[0]!, sortValue: (row) => row.name }],
      view: { value: { sort: "name", order: "desc" }, onChange: vi.fn() },
    });
    expect(screen.getAllByRole("rowheader")[0]).toHaveTextContent("volume-25");
  });
});

describe("DataTable row actions", () => {
  it("gives a disabled action its reason as the item's description", async () => {
    const user = userEvent.setup();
    renderTable({
      rows: volumes.slice(0, 1),
      rowActions: () => [
        {
          id: "delete",
          label: "Delete volume",
          onAction: vi.fn(),
          isDisabled: true,
          disabledReason: "Detach it from its instance first.",
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(
      screen.getByRole("menuitem", { name: "Delete volume" }),
    ).toHaveAccessibleDescription("Detach it from its instance first.");
  });
});

describe("DataTable selection", () => {
  it("selects only the rows on the page and clears on a page change", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderTable({
      batchActions: [{ id: "delete", label: "Delete", onAction }],
    });

    expect(
      screen.getByRole("button", { name: "With selected, 0" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Select All" }));
    await user.click(screen.getByRole("button", { name: "With selected, 20" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onAction).toHaveBeenCalledWith(volumes.slice(0, 20));
    expect(
      screen.getByRole("button", { name: "With selected, 0" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "Select All" }));
    expect(
      screen.getByRole("button", { name: "With selected, 20" }),
    ).toBeEnabled();
    await user.click(screen.getByRole("link", { name: "Next page" }));
    expect(
      screen.getByRole("button", { name: "With selected, 0" }),
    ).toBeDisabled();
  });

  it("lists a batch action the selection rules out, with the reason", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderTable({
      batchActions: [
        { id: "delete", label: "Delete", onAction, isDisabled: () => true },
      ],
    });

    await user.click(screen.getByRole("checkbox", { name: "Select volume-1" }));
    await user.click(screen.getByRole("button", { name: "With selected, 1" }));
    const item = screen.getByRole("menuitem", { name: "Delete" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAccessibleDescription(
      "Not available for the selected rows",
    );
  });

  it("clears the selection from the menu's last item", async () => {
    const user = userEvent.setup();
    renderTable({
      batchActions: [{ id: "delete", label: "Delete", onAction: vi.fn() }],
    });

    await user.click(screen.getByRole("checkbox", { name: "Select volume-1" }));
    await user.click(screen.getByRole("button", { name: "With selected, 1" }));
    const items = screen.getAllByRole("menuitem");
    expect(items.at(-1)).toHaveAccessibleName("Clear selection");
    await user.click(screen.getByRole("menuitem", { name: "Clear selection" }));
    expect(
      screen.getByRole("checkbox", { name: "Select volume-1" }),
    ).not.toBeChecked();
  });
});
