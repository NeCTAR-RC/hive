import { useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "../../lib/api/errors";
import { notify } from "../../lib/notify";
import { fieldsFor } from "../Form/fields";
import { FormDialog } from "./FormDialog";
import { useMutationForm, type FormMutation } from "./useMutationForm";

vi.mock("../../lib/notify", () => ({ notify: { success: vi.fn() } }));

const schema = z.object({ name: z.string().trim().min(1, "Enter a name") });
const { TextInput } = fieldsFor<z.infer<typeof schema>>();

function RenameDialog({
  mutation,
  onClose,
}: {
  mutation: FormMutation<string, string>;
  onClose: () => void;
}) {
  const { dialog } = useMutationForm({
    schema,
    defaultValues: { name: "web" },
    mutation,
    toVariables: (values) => (values.name === "web" ? null : values.name),
    successMessage: (_renamed, values) => `Renamed to ${values.name}.`,
    onDone: onClose,
  });
  return (
    <FormDialog {...dialog} title="Rename" submitLabel="Save">
      <TextInput name="name" label="Name" />
    </FormDialog>
  );
}

/** A page that owns the mutation, so it outlives every open of the dialog. */
function Page({ send }: { send: (name: string) => Promise<string> }) {
  const [isOpen, setOpen] = useState(false);
  const rename = useMutation({ mutationFn: send });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Rename
      </button>
      {isOpen && (
        <RenameDialog mutation={rename} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function renderPage(send: (name: string) => Promise<string>) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Page send={send} />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  return {
    user,
    open: () => user.click(screen.getByRole("button", { name: "Rename" })),
    rename: async (name: string) => {
      const field = screen.getByRole("textbox", { name: "Name" });
      await user.clear(field);
      await user.type(field, name);
      await user.click(screen.getByRole("button", { name: "Save" }));
    },
  };
}

describe("useMutationForm", () => {
  beforeEach(() => {
    vi.mocked(notify.success).mockClear();
    window.sessionStorage.clear();
  });

  it("sends the request, then notifies and closes", async () => {
    const send = vi.fn((name: string) => Promise.resolve(name));
    const page = renderPage(send);

    await page.open();
    await page.rename("db");

    expect(send).toHaveBeenCalledWith("db", expect.anything());
    expect(notify.success).toHaveBeenCalledWith("Renamed to db.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog open with the error when the request fails", async () => {
    const page = renderPage(() => Promise.reject(new Error("Name taken")));

    await page.open();
    await page.rename("db");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save: Name taken",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(notify.success).not.toHaveBeenCalled();
  });

  it("drops the error once the user edits a field", async () => {
    const page = renderPage(() => Promise.reject(new Error("Name taken")));
    await page.open();
    await page.rename("db");
    await screen.findByRole("alert");

    await page.user.type(screen.getByRole("textbox", { name: "Name" }), "2");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("forgets the error and the typed values when the dialog reopens", async () => {
    const page = renderPage(() => Promise.reject(new Error("Name taken")));
    await page.open();
    await page.rename("db");
    await screen.findByRole("alert");

    await page.user.click(screen.getByRole("button", { name: "Cancel" }));
    await page.open();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("web");
  });

  it("keeps the typed values for the next open when the session ended", async () => {
    const expired = new ApiError(401, {
      error: "session_expired",
      message: "Your session has expired.",
    });
    const page = renderPage(() => Promise.reject(expired));
    await page.open();
    await page.rename("db");
    await screen.findByRole("alert");

    // The login brings the user back to the same address; the dialog
    // mounts again there.
    await page.user.click(screen.getByRole("button", { name: "Cancel" }));
    await page.open();

    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("db");
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("closes without a request when there is nothing to send", async () => {
    const send = vi.fn((name: string) => Promise.resolve(name));
    const page = renderPage(send);

    await page.open();
    await page.user.click(screen.getByRole("button", { name: "Save" }));

    expect(send).not.toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  describe("with a 422 validation answer", () => {
    function invalid(loc: (string | number)[]) {
      return new ApiError(422, {
        error: "validation",
        message: "Names cannot contain spaces.",
        detail: [
          {
            loc,
            msg: "Value error, Names cannot contain spaces.",
            type: "value_error",
          },
        ],
      });
    }

    it("puts the rule's words under the field it names", async () => {
      const page = renderPage(() => Promise.reject(invalid(["body", "name"])));

      await page.open();
      await page.rename("my db");

      const field = screen.getByRole("textbox", { name: "Name" });
      expect(field).toHaveAccessibleDescription("Names cannot contain spaces.");
      expect(field).toHaveFocus();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("keeps the message above the form when no field is named", async () => {
      const page = renderPage(() =>
        Promise.reject(invalid(["body", "listener", 0])),
      );

      await page.open();
      await page.rename("my db");

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Names cannot contain spaces.",
      );
      expect(
        screen.getByRole("textbox", { name: "Name" }),
      ).not.toHaveAccessibleDescription();
    });
  });
});
