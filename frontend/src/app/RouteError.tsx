import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { ErrorState } from "../components/ErrorState/ErrorState";
import styles from "./RouteError.module.scss";

/**
 * What a route shows when it fails to load or render: the branded error with
 * "Try again", which reruns the routes' loaders and resets the boundary. A
 * failure inside the dashboard renders here in place of the page, inside the
 * shell; only a failure of the shell's own load renders it on its own.
 */
export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className={styles.page}>
      <h1>Something went wrong</h1>
      <ErrorState
        error={error}
        title="This page could not be shown"
        onRetry={() => void router.invalidate()}
      />
    </div>
  );
}
