import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { FormProvider } from "react-hook-form";
import type {
  FieldValues,
  SubmitHandler,
  UseFormReturn,
} from "react-hook-form";
import { focusFirstField, focusFirstInvalid } from "./focus";

export interface FormProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  /** Runs with the parsed values once the schema accepts them. */
  onValid: SubmitHandler<T>;
  /** Lets a button outside the form submit it (`<Button form={id}>`). */
  id?: string;
  className?: string;
  /** Focuses the first field when the form mounts (a dialog's form). */
  focusFirstFieldOnMount?: boolean;
  children: ReactNode;
}

/**
 * A react-hook-form form: provides `form` to the field bindings inside,
 * submits through `form.handleSubmit(onValid)`, and leaves validation to
 * the schema (`noValidate`). After each submit attempt, once the
 * validation result has rendered, focus moves to the first invalid field,
 * so a keyboard or screen-reader user lands on the problem instead of
 * staying on the submit button. A form that opens in a dialog can start
 * with focus on its first field (`focusFirstFieldOnMount`).
 */
export function Form<T extends FieldValues>({
  form,
  onValid,
  id,
  className,
  focusFirstFieldOnMount = false,
  children,
}: FormProps<T>) {
  const ref = useRef<HTMLFormElement>(null);
  const [attempts, setAttempts] = useState(0);

  // Runs before the dialog around the form moves focus to itself, which it
  // does only when focus is not already inside it.
  const focusOnMount = useRef(focusFirstFieldOnMount);
  useEffect(() => {
    if (focusOnMount.current && ref.current) focusFirstField(ref.current);
  }, []);

  // Runs after the render that follows a submit, when invalid fields carry
  // their invalid state in the DOM.
  useEffect(() => {
    if (attempts > 0 && ref.current) focusFirstInvalid(ref.current);
  }, [attempts]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    try {
      await form.handleSubmit(onValid)(event);
    } finally {
      setAttempts((count) => count + 1);
    }
  };

  return (
    <FormProvider {...form}>
      <form
        ref={ref}
        id={id}
        onSubmit={(event) => void submit(event)}
        noValidate
        className={className}
      >
        {children}
      </form>
    </FormProvider>
  );
}
