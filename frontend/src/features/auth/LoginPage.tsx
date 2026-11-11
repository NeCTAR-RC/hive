import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Alert, Link } from "@ardc-ui/react";
import { buildLoginUrl, loginHelpUrl, safeNext } from "../../lib/login";
import { configQuery } from "../../lib/queries";
import { useDocumentTitle } from "../../lib/hooks/useDocumentTitle";
import { useHiddenFooter } from "../../lib/hooks/useHiddenFooter";
import { REDUCED_MOTION, useMediaQuery } from "../../lib/hooks/useMediaQuery";
import { AppLink } from "../../components/AppLink/AppLink";
import { Skeleton } from "../../components/Skeleton/Skeleton";
import styles from "./LoginPage.module.scss";

const loginRoute = getRouteApi("/auth/auth/login");

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

/**
 * The login page as Sam and the designer settled it (review 73411): layout,
 * copy and artwork reproduce the nectar-dashboard login page
 * (theme/templates/auth/_login_page.html, _login_form.html, _splash.html
 * and _description.html). It stands alone under the mega menu, with no
 * header or footer. One "Log In" goes through manuka, which asks for the
 * federation itself.
 */
export function LoginPage() {
  useDocumentTitle("Log in");
  useHiddenFooter();
  const { next, reason } = loginRoute.useSearch();
  const { data: config, isPending } = useQuery(configQuery);
  const target = safeNext(next);
  const banner = reason ? REASONS[reason] : undefined;
  // The honeycomb's animations live in the SVG. An SVG used as an image
  // does not always see the page's motion setting, so the page itself asks
  // for the still picture (`#still`) when the visitor prefers reduced motion.
  const reducedMotion = useMediaQuery(REDUCED_MOTION);
  const artwork = reducedMotion ? "/login-bg.svg#still" : "/login-bg.svg";

  return (
    <div className={styles.page}>
      <img
        className={styles.background}
        src={artwork}
        alt=""
        aria-hidden="true"
      />
      <div className={styles.container}>
        <div className={styles.column}>
          <div className={styles.login}>
            <img
              className={styles.logo}
              src="/logo-splash.svg"
              alt="ARDC Nectar Research Cloud"
            />
            <h1>Welcome to the Dashboard.</h1>
            <p>
              Log in to ARDC&apos;s Nectar Research Cloud with your
              institutional account.
            </p>
            <p>
              Australian users can log in with the Australian Access Federation
              (AAF) and New Zealand users can log in with Tuakiri.
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
                <Link variant="primary" href={buildLoginUrl(config, target)}>
                  Log In
                </Link>
              )}
            </div>
            <p className={styles.help}>
              <AppLink href={loginHelpUrl(config?.help_url)} newTab>
                Having trouble logging in?
              </AppLink>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
