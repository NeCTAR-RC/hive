import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type {
  DefaultValues,
  FieldValues,
  Path,
  PathValue,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { UseMutationResult } from "@tanstack/react-query";
import type { z } from "zod";
import { ApiError } from "../../lib/api/errors";
import { notify } from "../../lib/notify";
import { dropDraft, sessionDrafts, stashDraft, takeDraft } from "./draft";
import type { FormDialogProps } from "./FormDialog";
import { isSaidByAField, serverFieldErrors } from "./serverErrors";

/** The parts of a React Query mutation a form dialog uses. */
export type FormMutation<TVariables, TData> = Pick<
  UseMutationResult<TData, Error, TVariables, unknown>,
  "mutate" | "reset" | "isPending" | "error"
>;

export interface MutationFormOptions<
  TValues extends FieldValues,
  TVariables,
  TData,
> {
  /** Validates the form; its messages are the fields' messages. */
  schema: z.ZodType<TValues, TValues>;
  /** Starting values known when the dialog opens. */
  defaultValues?: DefaultValues<NoInfer<TValues>>;
  /**
   * Starting values computed from data that may still be loading. The form
   * follows them as the data arrives, except for fields the user has
   * already edited (`keepDirtyValues`), so a preselection never overwrites
   * a choice. Compute them in render (memoised); never call `setValue`
   * from render.
   */
  values?: NoInfer<TValues>;
  mutation: FormMutation<TVariables, TData>;
  /**
   * The request for the submitted values, or null when there is nothing
   * to send (an edit that changed nothing): the dialog then just closes.
   * A literal the request type narrows (`type: "ssh"`) needs `as const`,
   * because TypeScript widens literals a generic callback returns.
   */
  toVariables: (values: TValues) => NoInfer<TVariables> | null;
  /** The toast after the request succeeds. */
  successMessage: string | ((data: NoInfer<TData>, values: TValues) => string);
  /** Anything else a success does, such as downloading a created key or
   * handing the created record to the page; runs before `onDone`. */
  onSuccess?: (data: NoInfer<TData>, values: TValues) => void;
  /** Closes the dialog, after a success or when there was nothing to send. */
  onDone: () => void;
}

/** What `useMutationForm` returns: the form, and the dialog's props. */
export interface MutationForm<TValues extends FieldValues> {
  form: FormDialogProps<TValues>["form"];
  /** Spread onto `<FormDialog>`. */
  dialog: Pick<
    FormDialogProps<TValues>,
    "form" | "onValid" | "onClose" | "isPending" | "error"
  >;
}

/**
 * The one way a dialog binds a form to a mutation. The form validates with
 * `schema`; a valid submit sends `toVariables(values)`, and a success shows
 * `successMessage` and calls `onDone`. A failure keeps the dialog open
 * with the error above the fields, and the user can correct and resend;
 * a 422 whose `detail` names a field puts its message under that field
 * instead, and the error above the fields stays only when no field said
 * it.
 *
 * The dialog mounts when it opens (see `FormDialog`), so the form starts
 * from its starting values every time; the mutation is reset when the
 * dialog mounts, so an error from an earlier open never shows again, even
 * when the page owns the mutation and shares it between dialogs.
 *
 * A submit that the session ending interrupts (a 401) is not lost: the
 * typed values are stashed for the page's address before the request goes
 * out and forgotten once it is answered any other way, so the same form
 * opening there after the login starts from them (see `draft.ts`).
 */
export function useMutationForm<
  TValues extends FieldValues,
  TVariables,
  TData,
>({
  schema,
  defaultValues,
  values,
  mutation,
  toVariables,
  successMessage,
  onSuccess,
  onDone,
}: MutationFormOptions<TValues, TVariables, TData>): MutationForm<TValues> {
  const form = useForm<TValues>({
    resolver: zodResolver(schema),
    defaultValues,
    values,
    resetOptions: { keepDirtyValues: true },
  });

  // React Query keeps `reset` stable for the mutation's lifetime, so this
  // runs once, when the dialog opens.
  const { reset } = mutation;
  useEffect(() => {
    reset();
  }, [reset]);

  // The error above the fields answered the values as they were sent; it
  // goes once the user changes them, so it never sits beside a newer
  // field message. The ref lets the subscription see the current error.
  const failed = useRef(false);
  const hasError = mutation.error !== null;
  useEffect(() => {
    failed.current = hasError;
  }, [hasError]);
  const { subscribe } = form;
  useEffect(
    () =>
      subscribe({
        formState: { values: true },
        callback: ({ type }) => {
          if (type === "change" && failed.current) reset();
        },
      }),
    [subscribe, reset],
  );

  // The address the form opened at, which names its draft.
  const [location] = useState(
    () => window.location.pathname + window.location.search,
  );
  useEffect(() => {
    const draft = takeDraft(
      sessionDrafts(),
      location,
      Object.keys(form.getValues()),
    );
    if (!draft) return;
    // Dirty, so values that arrive later (`keepDirtyValues`) keep them.
    for (const [name, value] of Object.entries(draft)) {
      form.setValue(
        name as Path<TValues>,
        value as PathValue<TValues, Path<TValues>>,
        { shouldDirty: true },
      );
    }
  }, [form, location]);

  // The form's own fields, which a 422's `detail[].loc` may name.
  const fieldNames = () => Object.keys(form.getValues());

  const onValid = (submitted: TValues) => {
    const variables = toVariables(submitted);
    if (variables === null) {
      onDone();
      return;
    }
    stashDraft(sessionDrafts(), location, form.getValues());
    mutation.mutate(variables, {
      onSuccess: (data) => {
        dropDraft(sessionDrafts(), location);
        onSuccess?.(data, submitted);
        notify.success(
          typeof successMessage === "string"
            ? successMessage
            : successMessage(data, submitted),
        );
        onDone();
      },
      onError: (error) => {
        if (!(error instanceof ApiError && error.isAuth)) {
          dropDraft(sessionDrafts(), location);
        }
        serverFieldErrors(error, fieldNames()).forEach(
          ({ field, message }, index) =>
            form.setError(
              field as Path<TValues>,
              { type: "server", message },
              { shouldFocus: index === 0 },
            ),
        );
      },
    });
  };

  const error = isSaidByAField(
    mutation.error,
    serverFieldErrors(mutation.error, fieldNames()),
  )
    ? null
    : mutation.error;

  return {
    form,
    dialog: {
      form,
      onValid,
      onClose: onDone,
      isPending: mutation.isPending,
      error,
    },
  };
}
