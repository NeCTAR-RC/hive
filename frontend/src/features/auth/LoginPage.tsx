import { useQuery } from "@tanstack/react-query";
import { Alert, Link } from "@ardc-ui/react";
import { loginRoute } from "../../app/router";
import { buildLoginUrl, safeNext } from "../../lib/login";
import { configQuery } from "../../lib/queries";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { ExternalLink } from "../../components/ExternalLink/ExternalLink";
import { RouteLink } from "../../components/RouteLink/RouteLink";
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

const SUPPORT_SITE = "https://support.ehelp.edu.au/";
const LOGIN_HELP_PATH = "/support/solutions/articles/6000055377";

/** The login help article on the support site `help_url` points at. The
 * configured URL is a page (by default ".../support/home"), so the article
 * path is resolved against its origin rather than appended. */
function loginHelpUrl(helpUrl: string | undefined): string {
  try {
    return new URL(LOGIN_HELP_PATH, helpUrl || SUPPORT_SITE).href;
  } catch {
    return new URL(LOGIN_HELP_PATH, SUPPORT_SITE).href;
  }
}

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
          <ExternalLink href={loginHelpUrl(config?.help_url)}>
            Having trouble logging in?
          </ExternalLink>
        </p>
        <p className={styles.terms}>
          By logging in you agree to the{" "}
          <RouteLink to="/terms">
            Nectar Research Cloud terms of service
          </RouteLink>
          .
        </p>
      </div>
    </div>
  );
}
