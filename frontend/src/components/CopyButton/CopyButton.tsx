import { Button } from "@ardc-ui/react";
import { useCopy } from "./useCopy";

/**
 * Copies text to the clipboard and says so: the button's label turns to
 * "Copied", and a polite live region beside it (never inside it, so the
 * button's name stays just "Copied") announces "Copied to clipboard". A
 * second copy restarts the timer; unmounting cancels it.
 */
export function CopyButton({
  text,
  label = "Copy",
  size = "xs",
}: {
  text: string;
  label?: string;
  size?: "xs" | "sm";
}) {
  const { copied, copy } = useCopy(text);

  return (
    <>
      <Button
        variant="secondary"
        size={size}
        iconBefore={copied ? "copy-check" : "copy"}
        onPress={() => void copy()}
      >
        {copied ? "Copied" : label}
      </Button>
      <span role="status" className="visually-hidden">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </>
  );
}
