import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useFormState } from "react-hook-form";
import type {
  FieldPath,
  FieldValues,
  SubmitHandler,
  UseFormReturn,
} from "react-hook-form";
import { focusFirstInvalid } from "../Form/focus";
import { useLeaveGuard } from "../LeaveGuard/useLeaveGuard";
import {
  firstStepWithError,
  isBefore,
  stepAfter,
  stepBefore,
  stepOrder,
  type WizardSteps,
} from "./steps";

/** A wizard's state and moves, for `WizardForm` and the page around it. */
export interface Wizard<
  TValues extends FieldValues,
  TId extends string,
  TProps extends object,
> {
  form: UseFormReturn<TValues>;
  steps: WizardSteps<TId, FieldPath<TValues>, TProps>;
  order: TId[];
  /** The step on screen. */
  step: TId;
  /** Validates the step's fields, then moves to the next step. */
  next: () => Promise<void>;
  back: () => void;
  /** Returns to a completed step (the Stepper's markers); later steps stay shut. */
  goBackTo: (id: TId) => void;
  /**
   * Wraps the page's submit: on a failed validation the wizard shows the
   * first step holding an error.
   */
  handleSubmit: (
    onValid: SubmitHandler<TValues>,
  ) => ReturnType<UseFormReturn<TValues>["handleSubmit"]>;
  /** The step heading, focused after every step change. */
  headingRef: RefObject<HTMLHeadingElement | null>;
  /** Releases the leave guard, then runs the navigation away. */
  leave: (go: () => void) => void;
  /** The leave question, which `WizardForm` renders. */
  leaveDialog: ReactNode;
}

/**
 * A multi-step create flow over one react-hook-form: the steps are a typed
 * record (see `WizardSteps`), Next validates only the current step's
 * fields and, when one fails, focuses the first invalid field; a failed
 * submit jumps to the first step with an error, focus moves to the new
 * step's heading after every change, and leaving with unsaved input asks
 * first (`leaveTitle`) until `leave` releases the page after the create
 * succeeded. While a field shows an error, every change checks it again,
 * so the message goes as soon as the value is right, whatever the field's
 * binding reports. Render it with `WizardForm`.
 */
export function useWizard<
  TValues extends FieldValues,
  TId extends string,
  TProps extends object,
>({
  form,
  steps,
  leaveTitle,
}: {
  form: UseFormReturn<TValues>;
  steps: WizardSteps<TId, FieldPath<TValues>, TProps>;
  leaveTitle: string;
}): Wizard<TValues, TId, TProps> {
  const order = useMemo(() => stepOrder(steps), [steps]);
  const [step, setStep] = useState<TId>(order[0]!);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const { isDirty, errors } = useFormState({ control: form.control });
  const guard = useLeaveGuard({ isDirty, title: leaveTitle });

  // Not on the first render: the page heading has focus after a navigation.
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    headingRef.current?.focus();
  }, [step]);

  // After a Next that failed, focus goes to the first invalid field of the
  // step panel (the heading's parent) once a render shows it invalid; the
  // form may report its errors a render after the failed Next itself.
  const [failedNexts, setFailedNexts] = useState(0);
  const focusPending = useRef(false);
  const errorCount = Object.keys(errors).length;
  useEffect(() => {
    if (!focusPending.current) return;
    const panel = headingRef.current?.parentElement;
    if (panel && focusFirstInvalid(panel)) focusPending.current = false;
  }, [failedNexts, errorCount]);

  // A change can fix an error on another field too (a rule across fields,
  // such as "a network or a port"), so every failing field is checked.
  useEffect(
    () =>
      form.subscribe({
        formState: { values: true },
        callback: () => {
          const failing = Object.keys(form.formState.errors).filter(
            (name) => name !== "root",
          ) as FieldPath<TValues>[];
          if (failing.length > 0) void form.trigger(failing);
        },
      }),
    [form],
  );

  const next = useCallback(async () => {
    const valid = await form.trigger([...steps[step].fields]);
    focusPending.current = !valid;
    if (valid) setStep(stepAfter(order, step));
    else setFailedNexts((count) => count + 1);
  }, [form, steps, order, step]);

  const back = useCallback(
    () => setStep(stepBefore(order, step)),
    [order, step],
  );

  const goBackTo = useCallback(
    (id: TId) => {
      if (isBefore(order, id, step)) setStep(id);
    },
    [order, step],
  );

  const handleSubmit = useCallback(
    (onValid: SubmitHandler<TValues>) =>
      form.handleSubmit(onValid, (errors) => {
        const id = firstStepWithError(order, steps, errors);
        if (id !== undefined) setStep(id);
      }),
    [form, order, steps],
  );

  return {
    form,
    steps,
    order,
    step,
    next,
    back,
    goBackTo,
    handleSubmit,
    headingRef,
    leave: guard.leave,
    leaveDialog: guard.dialog,
  };
}
