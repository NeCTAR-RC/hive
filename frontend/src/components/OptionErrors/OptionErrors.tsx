import type { ReactNode } from "react";
import { Alert } from "@ardc-ui/react";
import { humanise } from "../../lib/status";

/**
 * The warning a form shows when its options endpoint could load only some
 * sections: one line per failed section, so the user knows which choices
 * are missing and can still go ahead with the rest. Renders nothing when
 * every section loaded.
 */
export function OptionErrors({
  errors,
  labels = {},
  children,
}: {
  /** The endpoint's `errors` map: section name to why it failed. */
  errors: Record<string, { message: string }> | null | undefined;
  /** Names to show for sections; others are shown sentence cased. */
  labels?: Record<string, string>;
  /** Anything the user should know after the list. */
  children?: ReactNode;
}) {
  const entries = Object.entries(errors ?? {});
  if (entries.length === 0) return null;
  return (
    <Alert
      tone="warning"
      role="status"
      title="Some choices could not be loaded"
    >
      <ul>
        {entries.map(([section, error]) => (
          <li key={section}>
            {labels[section] ?? humanise(section)}: {error.message}
          </li>
        ))}
      </ul>
      {children}
    </Alert>
  );
}
