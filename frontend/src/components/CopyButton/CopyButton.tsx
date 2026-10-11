import { useState } from "react";
import { Button } from "@ardc-ui/react";
import { notify } from "../../lib/notify";

/** Copies text to the clipboard and says so, in the button and aloud. */
export function CopyButton({
  text,
  label = "Copy",
  size = "xs",
}: {
  text: string;
  label?: string;
  size?: "xs" | "sm";
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.warning("Copying is not available in this browser.");
    }
  };
  return (
    <Button
      variant="secondary"
      size={size}
      iconBefore={copied ? "copy-check" : "copy"}
      onPress={() => void copy()}
    >
      {copied ? "Copied" : label}
      <span role="status" className="visually-hidden">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </Button>
  );
}
