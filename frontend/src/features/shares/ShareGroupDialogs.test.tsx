import { useEffect } from "react";
import { act, render, screen } from "@testing-library/react";
import { useForm, useWatch } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { useShareTypesReset, type CreateShareGroupValues } from "./shareForms";

const handle: { form: UseFormReturn<CreateShareGroupValues> | null } = {
  form: null,
};

function Harness() {
  const form = useForm<CreateShareGroupValues>({
    defaultValues: {
      name: "",
      description: "",
      snapshot_id: "",
      share_group_type_id: "gt-1",
      share_types: ["st-1"],
      availability_zone: "",
    },
  });
  useShareTypesReset(form);
  useEffect(() => {
    handle.form = form;
  }, [form]);
  const types = useWatch({ control: form.control, name: "share_types" });
  return <p data-testid="types">{types.join(",") || "none"}</p>;
}

describe("useShareTypesReset", () => {
  it("clears the ticked share types when the group type changes", () => {
    render(<Harness />);
    expect(screen.getByTestId("types").textContent).toBe("st-1");
    act(() => handle.form?.setValue("share_types", ["st-1", "st-2"]));
    expect(screen.getByTestId("types").textContent).toBe("st-1,st-2");
    act(() => handle.form?.setValue("share_group_type_id", "gt-2"));
    expect(screen.getByTestId("types").textContent).toBe("none");
  });
});
