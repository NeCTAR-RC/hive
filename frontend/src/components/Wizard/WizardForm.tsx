import type { ReactNode } from "react";
import { Button, StepItem, Stepper } from "@ardc-ui/react";
import { FormProvider } from "react-hook-form";
import type { FieldValues } from "react-hook-form";
import { AppLink } from "../AppLink/AppLink";
import { loadingProps } from "../buttonState";
import { ErrorState } from "../ErrorState/ErrorState";
import { SkeletonLines } from "../Skeleton/Skeleton";
import type { Wizard } from "./useWizard";
import styles from "./Wizard.module.scss";

/** The parts of the create mutation the wizard shows. */
interface Submission {
  isPending: boolean;
  isError: boolean;
  error: unknown;
}

export interface WizardFormProps<
  TValues extends FieldValues,
  TId extends string,
  TProps extends object,
> {
  wizard: Wizard<TValues, TId, TProps>;
  /** What every step component gets; `undefined` while the options load. */
  stepProps: TProps | undefined;
  /** Names the Stepper's list of steps ("Launch steps"). */
  label: string;
  /** The page's submit, made with `wizard.handleSubmit`. */
  onSubmit: () => Promise<unknown>;
  submission: Submission;
  /** The final button ("Launch") and its busy text ("Launching..."). */
  submitLabel: string;
  pendingLabel: string;
  /** The lead-in of the error shown when the create fails. */
  errorTitle: string;
  /**
   * Where Cancel goes (the list the page creates into). The leave guard
   * asks first, as for any other way out, while there is unsaved input.
   */
  cancelTo: string;
  /** Alerts above the steps (missing options, quota). */
  notices?: ReactNode;
  /** A side column beside the wizard (a summary), "Sidebar right". */
  aside?: ReactNode;
}

/**
 * A wizard page's form: notices, the library `Stepper` as shipped with the
 * current step in a panel, the create error and one button row (Back, then
 * Next or the submit button, then Cancel), with an optional side column.
 * Enter advances a step and only the last step submits. Each step panel
 * starts with a visually hidden heading naming the step, which takes focus
 * after a step change while a polite live region announces "Step 2 of 5:
 * Pool", since the Stepper itself moves no focus.
 */
export function WizardForm<
  TValues extends FieldValues,
  TId extends string,
  TProps extends object,
>({
  wizard,
  stepProps,
  label,
  onSubmit,
  submission,
  submitLabel,
  pendingLabel,
  errorTitle,
  cancelTo,
  notices,
  aside,
}: WizardFormProps<TValues, TId, TProps>) {
  const { form, steps, order, step } = wizard;
  const position = order.indexOf(step);
  const isLast = position === order.length - 1;

  return (
    <>
      <FormProvider {...form}>
        <form
          // Enter advances a step; only the submit button submits, and it is
          // a plain button so a Next press can never land on it mid-swap.
          onSubmit={(event) => {
            event.preventDefault();
            void (isLast ? onSubmit() : wizard.next());
          }}
          noValidate
          className={aside ? styles.layout : undefined}
        >
          <div className={styles.main}>
            <div className={styles.notices}>{notices}</div>
            <Stepper
              activeStep={step}
              onActiveStepChange={(key) => wizard.goBackTo(String(key) as TId)}
              allowsJumping
              aria-label={label}
            >
              {order.map((id) => {
                const { title, Component } = steps[id];
                return (
                  <StepItem key={id} id={id} title={title}>
                    <div className={styles.step}>
                      <h2
                        ref={wizard.headingRef}
                        tabIndex={-1}
                        className="visually-hidden"
                      >
                        {title}
                      </h2>
                      {stepProps === undefined ? (
                        <SkeletonLines />
                      ) : (
                        <Component {...stepProps} />
                      )}
                    </div>
                  </StepItem>
                );
              })}
            </Stepper>
            <div role="status" className="visually-hidden">
              {`Step ${position + 1} of ${order.length}: ${steps[step].title}`}
            </div>
            {submission.isError && (
              <ErrorState error={submission.error} title={errorTitle} />
            )}
            <div className={styles.buttons}>
              <Button
                variant="secondary"
                onPress={wizard.back}
                isDisabled={position === 0 || submission.isPending}
              >
                Back
              </Button>
              {!isLast ? (
                <Button
                  onPress={() => void wizard.next()}
                  isDisabled={stepProps === undefined}
                >
                  Next
                </Button>
              ) : (
                <Button
                  {...loadingProps(submission.isPending, pendingLabel)}
                  onPress={() => void onSubmit()}
                >
                  {submitLabel}
                </Button>
              )}
              <AppLink
                variant="secondary"
                href={cancelTo}
                isDisabled={submission.isPending}
              >
                Cancel
              </AppLink>
            </div>
          </div>
          {aside}
        </form>
      </FormProvider>
      {wizard.leaveDialog}
    </>
  );
}
