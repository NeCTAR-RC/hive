import { useQuery } from "@tanstack/react-query";
import { Alert, Link } from "@ardc-ui/react";
import { loginRoute } from "../../app/router";
import { buildLoginUrl, safeNext } from "../../lib/login";
import { configQuery } from "../../lib/queries";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { Skeleton } from "../../components/Skeleton/Skeleton";
import styles from "./LoginPage.module.scss";

const REASONS: Record<string, { tone: "danger" | "info"; text: string }> = {
  invalid_token: {
    tone: "danger",
    text: "Your login could not be verified. Please try again.",
  },
  no_projects: {
    tone: "danger",
    text:
      "Your account has no active projects. Contact the Nectar Support " +
      "Centre if you believe this is a mistake.",
  },
  expired: {
    tone: "info",
    text: "Your session ended. Please log in again.",
  },
};

export function LoginPage() {
  useDocumentTitle("Log in");
  const { next, reason } = loginRoute.useSearch();
  const { data: config, isPending } = useQuery(configQuery);
  const target = safeNext(next);
  const banner = reason ? REASONS[reason] : undefined;

  return (
    <div className={styles.page}>
      <div className={styles.brand} aria-hidden="true" />
      <div className={styles.card}>
        <img
          className={styles.logo}
          src="/logo-splash.svg"
          alt="ARDC Nectar Research Cloud"
        />
        <h1 className={styles.title}>Welcome to the Dashboard.</h1>
        <p>
          Please choose your identity federation to log in to ARDC&apos;s Nectar
          Research Cloud.
        </p>
        <p>
          Australian users can log in with the Australian Access Federation
          (AAF).
          {config?.login_base_url_nz &&
            " New Zealand users can log in with Tuakiri."}
        </p>
        {banner && (
          <Alert tone={banner.tone} role="status">
            {banner.text}
          </Alert>
        )}
        {next && target !== "/" && (
          <Alert tone="info" role="status">
            Log in to continue to <strong>{target}</strong>.
          </Alert>
        )}
        <div className={styles.buttons}>
          {isPending || !config ? (
            <Skeleton height="2.75rem" width="14rem" />
          ) : (
            <>
              <Link variant="primary" href={buildLoginUrl(config, target)}>
                Log in via AAF (Australia)
              </Link>
              {config.login_base_url_nz && (
                <Link
                  variant="secondary"
                  href={buildLoginUrl(config, target, true)}
                >
                  Log in via Tuakiri (NZ)
                </Link>
              )}
            </>
          )}
        </div>
        <p className={styles.help}>
          <a
            href={
              (config?.help_url ?? "https://support.ehelp.edu.au/") +
              "support/solutions/articles/6000055377"
            }
          >
            Having trouble logging in?
          </a>
        </p>
        <p className={styles.terms}>
          By logging in you agree to the{" "}
          <a href="/terms">Nectar Research Cloud terms of service</a>.
        </p>
      </div>
    </div>
  );
}
