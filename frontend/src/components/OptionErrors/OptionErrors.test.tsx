import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OptionErrors } from "./OptionErrors";

const failure = (message: string) => ({ error: "unavailable", message });

describe("OptionErrors", () => {
  it.each([
    { name: "no map", errors: undefined },
    { name: "a null map", errors: null },
    { name: "an empty map", errors: {} },
  ])("renders nothing for $name", ({ errors }) => {
    const { container } = render(<OptionErrors errors={errors} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each failed section, sentence cased unless labelled", () => {
    render(
      <OptionErrors
        errors={{
          key_pairs: failure("nova timed out"),
          flavors: failure("nova is down"),
        }}
        labels={{ flavors: "Flavours" }}
      >
        <p>You can still launch with what is available.</p>
      </OptionErrors>,
    );
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "Key pairs: nova timed out",
      "Flavours: nova is down",
    ]);
    expect(
      screen.getByText("You can still launch with what is available."),
    ).toBeInTheDocument();
  });
});
