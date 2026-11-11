import { Alert, Button } from "@ardc-ui/react";
import { ApiError } from "../../lib/api/client";
import styles from "./ErrorState.module.scss";

/**
 * An inline failure: the library `Alert`, as shipped, holding the title as a
 * bold lead-in to the message (the alert's own rich content pattern), the
 * request id support will ask for, and an optional "Try again". `danger`
 * (the default) stands in for content that could not load and interrupts as
 * an alert; `warning` sits above content that is still shown but may be out
 * of date, and is announced politely.
 */
export function ErrorState({
  error,
  title = "Something went wrong",
  onRetry,
  tone = "danger",
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  tone?: "danger" | "warning";
}) {
  const api = error instanceof ApiError ? error : null;
  const message =
    api?.message ?? (error instanceof Error ? error.message : String(error));
  return (
    <Alert tone={tone} role={tone === "danger" ? "alert" : "status"}>
      <div className={styles.content}>
        <p>
          <strong>{title}</strong>: {message}
        </p>
        {api?.requestId && <p>Reference: {api.requestId}</p>}
        {onRetry && (
          <Button variant="secondary" size="xs" onPress={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </Alert>
  );
}
