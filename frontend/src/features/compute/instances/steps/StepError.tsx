// A launch step's error under a choice made outside a library field.
import { FieldError } from "@ardc-ui/react";
import { FieldErrorContext } from "react-aria-components";
import styles from "../LaunchPage.module.scss";

/** The validity React Aria reports for an error the form raised itself. */
const CUSTOM_ERROR = { valid: false, customError: true } as ValidityState;

/**
 * A step's error under a choice made outside a library field (the flavour
 * table): the library `FieldError`, given the invalid state through React
 * Aria's field error context since no field provides it, in a live region
 * so it is announced when Next is pressed.
 */
export function StepError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <div role="alert" className={styles.error}>
      <FieldErrorContext.Provider
        value={{
          isInvalid: true,
          validationErrors: [message],
          validationDetails: CUSTOM_ERROR,
        }}
      >
        <FieldError>{message}</FieldError>
      </FieldErrorContext.Provider>
    </div>
  );
}
