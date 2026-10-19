import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, useWatch } from "react-hook-form";
import { beforeAll, describe, expect, it } from "vitest";
import { stubResizeObserver } from "../testing/resizeObserver";
import { ComboboxInput } from "./fields";

const OPTIONS = [
  { id: "mel", label: "Melbourne" },
  { id: "syd", label: "Sydney" },
  { id: "tas", label: "Tasmania" },
];

function Harness() {
  const form = useForm<{ zone: string | null }>({
    defaultValues: { zone: null },
  });
  const zone = useWatch({ control: form.control, name: "zone" });
  return (
    <>
      <ComboboxInput
        control={form.control}
        name="zone"
        label="Zone"
        options={OPTIONS}
      />
      <output aria-label="Chosen">{zone ?? ""}</output>
    </>
  );
}

describe("ComboboxInput", () => {
  beforeAll(() => {
    stubResizeObserver();
  });

  it("filters the options and stores the chosen id", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox", { name: "Zone" }), "syd");
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Sydney"]);

    await user.click(options[0]!);
    expect(screen.getByLabelText("Chosen")).toHaveTextContent("syd");
  });
});
