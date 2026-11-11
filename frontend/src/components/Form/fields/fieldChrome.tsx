import type { ReactElement } from "react";
import { FieldError, Label, Text } from "@ardc-ui/react";

/** The label, help text and validation message of one field. */
export interface FieldChrome {
  label: ReactElement;
  description: ReactElement | null;
  error: ReactElement;
}

/**
 * The parts every binding renders around its control, in the design
 * system's slots: the label, the help text (`slot="description"`) and the
 * validation message. React Aria ties the label to the control and lists
 * the help text and, while the field is invalid, the message in its
 * accessible description.
 *
 * Returned as separate elements rather than one component, because the
 * library's fields find the label and help text among their direct
 * children by element type, and choice fields place the message after
 * their options.
 */
export function fieldChrome({
  label,
  description,
  errorMessage,
}: {
  label: string;
  description: string | undefined;
  errorMessage: string | undefined;
}): FieldChrome {
  return {
    label: <Label>{label}</Label>,
    description: description ? (
      <Text slot="description">{description}</Text>
    ) : null,
    error: <FieldError>{errorMessage}</FieldError>,
  };
}
