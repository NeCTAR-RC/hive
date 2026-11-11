/** What a caller hears back from an appended script. */
export interface ScriptEvents {
  /** The script loaded and ran. */
  onLoad?: () => void;
  /** The script could not load (blocked, offline, or the host failed). */
  onError?: () => void;
}

/**
 * Appends an external classic script to the document head, to load and run
 * without holding up the page. Third-party scripts come in this way, never
 * as inline `<script>` or event-handler attributes, so the CSP's
 * `script-src` allows them by origin alone.
 */
export function appendScript(
  src: string,
  { onLoad, onError }: ScriptEvents = {},
): HTMLScriptElement {
  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  if (onLoad) script.addEventListener("load", onLoad, { once: true });
  if (onError) script.addEventListener("error", onError, { once: true });
  document.head.append(script);
  return script;
}
