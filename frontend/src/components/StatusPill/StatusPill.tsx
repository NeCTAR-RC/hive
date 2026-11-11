import { Badge, Loader } from "@ardc-ui/react";

export type StatusTone =
  "neutral" | "info" | "success" | "warning" | "danger" | "progress";

/**
 * A resource status ("Active", "Error", "Building") as the library `Badge`,
 * as shipped. The words are the signal. A transitional state (`progress`)
 * adds the library's loader glyph before them, which the badge draws at its
 * own icon size.
 *
 * `tone` names the state for a toned badge the library does not have yet
 * (the gap "Status badge with tones" in DESIGN-NOTES.md); apart from
 * `progress` it changes nothing on screen until that badge exists.
 */
export function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: StatusTone;
  children: string;
}) {
  return (
    <Badge>
      {tone === "progress" && <Loader aria-hidden="true" />}
      {children}
    </Badge>
  );
}
