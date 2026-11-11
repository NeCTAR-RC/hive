import { Button } from "@ardc-ui/react";
import { loadingProps } from "../buttonState";

/**
 * A dialog's action row: Cancel, then the action that ends the task. While
 * `isPending` Cancel is disabled and the action, still the same focusable
 * button, shows the library's loading state with `pendingLabel` and ignores
 * presses. With `form`, the action is that form's submit button, so Enter in
 * a field submits as usual.
 */
export function DialogActions({
  label,
  pendingLabel,
  tone,
  isPending,
  isDisabled,
  onPress,
  form,
}: {
  label: string;
  pendingLabel: string;
  tone?: "danger";
  isPending: boolean;
  isDisabled?: boolean;
  onPress?: () => void;
  form?: string;
}) {
  return (
    <>
      <Button variant="secondary" slot="close" isDisabled={isPending}>
        Cancel
      </Button>
      <Button
        type={form ? "submit" : "button"}
        form={form}
        tone={tone}
        {...loadingProps(isPending, pendingLabel)}
        isDisabled={!isPending && isDisabled}
        onPress={onPress}
      >
        {label}
      </Button>
    </>
  );
}
