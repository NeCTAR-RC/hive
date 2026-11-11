import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { fieldsFor } from "../Form/fields";
import { FormDialog } from "./FormDialog";

const schema = z.object({
  description: z.string(),
  name: z.string().min(1, "Enter a backup name"),
});
type Values = z.infer<typeof schema>;

const { TextInput } = fieldsFor<Values>();

function BackupDialog({
  onSave,
  onClose = vi.fn(),
  isPending,
}: {
  onSave: (values: Values) => void;
  onClose?: () => void;
  isPending?: boolean;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "" },
  });
  return (
    <FormDialog
      form={form}
      onValid={onSave}
      onClose={onClose}
      isPending={isPending}
      title="Create backup"
      submitLabel="Create"
    >
      <TextInput name="description" label="Notes" />
      <TextInput name="name" label="Backup name" isRequired />
    </FormDialog>
  );
}

describe("FormDialog", () => {
  it("opens with focus on its first field", () => {
    render(<BackupDialog onSave={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveFocus();
  });

  it("moves focus to the first invalid field after a failed submit", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<BackupDialog onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Backup name" })).toHaveFocus();
  });

  it("submits the parsed values", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<BackupDialog onSave={onSave} />);

    await user.type(
      screen.getByRole("textbox", { name: "Backup name" }),
      "nightly",
    );
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(onSave).toHaveBeenCalledWith(
      { name: "nightly", description: "" },
      expect.anything(),
    );
  });

  it("closes on Cancel, but not while the request runs", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(
      <BackupDialog onSave={vi.fn()} onClose={onClose} isPending />,
    );
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();

    rerender(<BackupDialog onSave={vi.fn()} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
