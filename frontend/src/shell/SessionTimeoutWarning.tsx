import { useEffect, useState } from "react";
import { Alert, Link } from "@ardc-ui/react";
import type { Me, PublicConfig } from "../lib/api/types";
import { buildLoginUrl } from "../lib/login";
import styles from "./SessionTimeoutWarning.module.scss";

const WARN_BEFORE = 10 * 60; // seconds

/**
 * Sessions are capped by the Keystone token and never renewed (as in
 * Horizon), so warn before the cap rather than surprising the user with a
 * 401 mid-task.
 */
export function SessionTimeoutWarning({
  me,
  config,
}: {
  me: Me | undefined;
  config: PublicConfig | undefined;
}) {
  const expiresAt = me?.session.expires_at;
  const [remaining, setRemaining] = useState<number | null>(null);

  // Restart the countdown whenever the expiry changes (it is undefined
  // until `me` arrives), reading the clock at once rather than waiting for
  // the first tick.
  useEffect(() => {
    const tick = () =>
      setRemaining(
        expiresAt ? Math.round(expiresAt - Date.now() / 1000) : null,
      );
    const first = window.setTimeout(tick, 0);
    if (!expiresAt) return () => window.clearTimeout(first);
    const timer = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [expiresAt]);

  if (remaining === null || remaining > WARN_BEFORE) return null;
  const minutes = Math.max(1, Math.round(remaining / 60));
  const next = window.location.pathname + window.location.search;
  return (
    <Alert tone="warning" role="status" className={styles.banner}>
      <p>
        Your login session ends in about {minutes}{" "}
        {minutes === 1 ? "minute" : "minutes"}. Save your work, then{" "}
        {config ? (
          <Link variant="link" href={buildLoginUrl(config, next)}>
            sign in again
          </Link>
        ) : (
          "sign in again"
        )}
        .
      </p>
    </Alert>
  );
}
