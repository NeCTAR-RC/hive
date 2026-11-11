import { useId, type ReactNode } from "react";
import type { ModalSize } from "@ardc-ui/react";
import type {
  FieldValues,
  SubmitHandler,
  UseFormReturn,
} from "react-hook-form";
import { DialogActions } from "../Dialog/DialogActions";
import { DialogFrame } from "../Dialog/DialogFrame";
import { ErrorState } from "../ErrorState/ErrorState";
import { Form } from "../Form/Form";
import styles from "./FormDialog.module.scss";

export interface FormDialogProps<T extends FieldValues> {
  /** The dialog's form; its fields are the bindings in the body. */
  form: UseFormReturn<T>;
  /** Runs with the parsed values once the schema accepts them. */
  onValid: SubmitHandler<T>;
  /** Closes the dialog: the page stops rendering it. */
  onClose: () => void;
  title: string;
  size?: ModalSize;
  submitLabel: string;
  submitTone?: "danger";
  isPending?: boolean;
  /** Keeps the submit button disabled, for a form the dialog itself can
   * tell is not valid yet (the reason belongs in the form body). */
  isSubmitDisabled?: boolean;
  /** Shown above the fields: why the last submit, or a load the form
   * needs, failed. */
  error?: unknown;
  children: ReactNode;
}

/**
 * A modal holding a form. A form dialog exists only while it is open: the
 * page renders it when the user opens it and stops rendering it on
 * `onClose`, so its form, mutation and any local state start fresh on
 * every open. `useMutationForm` provides `form`, `onValid`, `onClose`,
 * `isPending` and `error` for a dialog that sends one request.
 *
 * The submit button lives in the dialog's action row and is tied to the
 * form by id, so Enter in a field submits as usual. Focus starts on the
 * first field, and after a failed submit moves to the first invalid one
 * (see `Form`); closing returns it to whatever opened the dialog. While
 * `isPending` nothing closes the dialog.
 */
export function FormDialog<T extends FieldValues>({
  form,
  onValid,
  onClose,
  title,
  size,
  submitLabel,
  submitTone,
  isPending = false,
  isSubmitDisabled,
  error,
  children,
}: FormDialogProps<T>) {
  const formId = useId();
  return (
    <DialogFrame
      onClose={onClose}
      isPending={isPending}
      title={title}
      size={size}
      actions={
        <DialogActions
          label={submitLabel}
          pendingLabel="Saving..."
          tone={submitTone}
          isPending={isPending}
          isDisabled={isSubmitDisabled}
          form={formId}
        />
      }
    >
      <Form
        form={form}
        onValid={onValid}
        id={formId}
        className={styles.form}
        focusFirstFieldOnMount
      >
        {error ? <ErrorState error={error} title="Could not save" /> : null}
        {children}
      </Form>
    </DialogFrame>
  );
}
