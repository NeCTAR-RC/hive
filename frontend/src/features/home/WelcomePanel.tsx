// The dismissable introduction for new users on the home page.
import { Button } from "@ardc-ui/react";
import { useState } from "react";
import { AppLink } from "../../components/AppLink/AppLink";
import type { PublicConfig } from "../../lib/api/types/session";
import { readLocal, writeLocal } from "../../lib/storage";
import { SUPPORT_LINKS } from "../../shell/ServiceHeader/menu-data";
import { LIVE_TRAINING, STARTER, VIDEO } from "./data/links";
import styles from "./HomePage.module.scss";

const WELCOME_KEY = "welcomeDismissed";

/**
 * The introduction for new users, as the content blocks' "50-50 Media Left"
 * band: the video, then the welcome copy over the ways into support and the
 * Dismiss button. It stays dismissed once dismissed, per browser.
 */
export function WelcomePanel({ config }: { config: PublicConfig | undefined }) {
  const [dismissed, setDismissed] = useState(() =>
    readLocal(WELCOME_KEY, false),
  );
  if (dismissed) return null;
  const dismiss = () => {
    writeLocal(WELCOME_KEY, true);
    setDismissed(true);
  };
  return (
    <section className={styles.welcome} aria-labelledby="welcome-heading">
      <div className={styles.welcomeSplit}>
        <div className={styles.video}>
          <iframe
            src={VIDEO}
            title="Introduction to the Nectar Research Cloud dashboard"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
          />
        </div>
        <div className={styles.welcomeCopy}>
          <div className={styles.intro}>
            <h2 id="welcome-heading">Welcome to the Dashboard!</h2>
            <p>
              <em>The Dashboard</em> is your web interface to the{" "}
              <strong>ARDC Nectar Research Cloud</strong>, Australia&apos;s
              national research cloud, giving you access to powerful computing
              resources without the need to purchase or host your own hardware.
            </p>
            <p>
              New to Nectar? There are support articles and tutorials to help
              you along the way, and if you need help you can contact the
              Support team by creating a help request.
            </p>
            <p>
              To get started with the Nectar Cloud, we recommend following the{" "}
              <AppLink href={STARTER} newTab>
                Cloud Starter Series
              </AppLink>{" "}
              of tutorials.
            </p>
          </div>
          <div className={styles.buttons}>
            <AppLink
              variant="primary"
              size="sm"
              href={config?.help_url ?? SUPPORT_LINKS.supportCentre}
              newTab
            >
              Support Centre
            </AppLink>
            <AppLink
              variant="secondary"
              size="sm"
              href={SUPPORT_LINKS.tutorials}
              newTab
            >
              Tutorials
            </AppLink>
            <AppLink variant="secondary" size="sm" href={LIVE_TRAINING} newTab>
              Live training
            </AppLink>
            <Button variant="secondary" size="sm" onPress={dismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
