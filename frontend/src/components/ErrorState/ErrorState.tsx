import { Alert, Button } from "@ardc-ui/react";
import { ApiError } from "../../lib/api/client";
import styles from "./ErrorState.module.scss";

/** Inline failure with the request id support will ask for. */
export function ErrorState({
  error,
  title = "Something went wrong",
  onRetry,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}) {
  const api = error instanceof ApiError ? error : null;
  const message =
    api?.message ?? (error instanceof Error ? error.message : String(error));
  return (
    <Alert tone="danger" role="alert" className={styles.alert}>
      <p className={styles.title}>{title}</p>
      <p>{message}</p>
      {api?.requestId && (
        <p className={styles.reference}>Reference: {api.requestId}</p>
      )}
      {onRetry && (
        <Button variant="secondary" size="xs" onPress={onRetry}>
          Try again
        </Button>
      )}
    </Alert>
  );
}
