import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { renderInForm } from "../../test/renderInForm";
import { KeyValueFields } from "./KeyValueFields";
import { keyValueSchema } from "./keyValue";

const schema = z.object({ metadata: keyValueSchema });

function renderEditor(rows: { key: string; value: string }[]) {
  return renderInForm(
    <KeyValueFields
      name="metadata"
      addLabel="Add metadata"
      emptyText="No metadata is set."
    />,
    { schema, defaultValues: { metadata: rows } },
  );
}

describe("KeyValueFields", () => {
  it("says so when there are no rows, and adds one", async () => {
    const { user } = renderEditor([]);
    expect(screen.getByText("No metadata is set.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add metadata" }));
    expect(screen.getByRole("textbox", { name: "Key" })).toBeInTheDocument();
    expect(screen.queryByText("No metadata is set.")).not.toBeInTheDocument();
  });

  it("shows the list's error for a repeated key", async () => {
    const { submit } = renderEditor([
      { key: "role", value: "web" },
      { key: "role", value: "db" },
    ]);
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Keys must be unique",
    );
  });

  it("removes a row", async () => {
    const { user } = renderEditor([
      { key: "role", value: "web" },
      { key: "tier", value: "front" },
    ]);
    const [first] = screen.getAllByRole("button", { name: "Remove" });
    if (!first) throw new Error("No Remove button");
    await user.click(first);
    const keys = screen.getAllByRole("textbox", { name: "Key" });
    expect(keys).toHaveLength(1);
    expect(keys[0]).toHaveValue("tier");
  });
});
