import { useEffect, useState } from "react";
import { Alert, Link } from "@ardc-ui/react";
import type { Me, PublicConfig } from "../lib/api/types/session";
import { buildLoginUrl } from "../lib/login";
import { secondsLeft, warningMinutes } from "./session-time";
import styles from "./SessionTimeoutWarning.module.scss";

/** How often the remaining time is worked out again. */
const TICK_MS = 30_000;

/**
 * Sessions are capped by the Keystone token and never renewed (as in
 * Horizon), so warn before the cap rather than surprising the user with a
 * 401 mid-task. The time left is measured on the server's clock (see
 * secondsLeft) and worked out again whenever /api/me answers anew.
 */
export function SessionTimeoutWarning({
  me,
  meReceivedAt,
  config,
}: {
  me: Me | undefined;
  /** The browser's clock when `me` arrived (the query's dataUpdatedAt). */
  meReceivedAt: number;
  config: PublicConfig | undefined;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const minutes = me
    ? warningMinutes(secondsLeft(me.session, meReceivedAt, now))
    : null;
  if (minutes === null) return null;
  const next = window.location.pathname + window.location.search;
  return (
    <div className={styles.banner}>
      <Alert tone="warning" role="status">
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
    </div>
  );
}
