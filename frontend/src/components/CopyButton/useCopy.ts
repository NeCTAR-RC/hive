import { useEffect, useState } from "react";
import { notify } from "../../lib/notify";

/** How long a copy control shows its copied state. */
const COPIED_MS = 2000;

/**
 * Clipboard copy with a copied state that lasts two seconds after the last
 * copy: a second copy restarts the timer, unmounting cancels it. A browser
 * that refuses the write gets a warning toast and no copied state.
 */
export function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const [copies, setCopies] = useState(0);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied, copies]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopies((count) => count + 1);
    } catch {
      notify.warning("Copying is not available in this browser.");
    }
  };

  return { copied, copy };
}
