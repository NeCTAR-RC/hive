// The home page's quick links: learning, actions, views and support.
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../components/AppLink/AppLink";
import type { Me, PublicConfig } from "../../lib/api/types/session";
import { openHelpWidget } from "../../lib/help";
import { SUPPORT_LINKS } from "../../shell/ServiceHeader/menu-data";
import {
  ALLOCATIONS_ARTICLE,
  LIVE_TRAINING_REGISTRATION,
  SECURITY_TUTORIAL,
  STARTER,
} from "./data/links";
import styles from "./HomePage.module.scss";
import { LinkBlock } from "./LinkBlock";
import { LinkRow } from "./LinkRow";

/**
 * Horizon's quick links: four blocks of links to learning material, common
 * actions, views of the project and support, under the section's intro.
 * A trial project gets no Allocation usage link.
 */
export function QuickLinks({
  me,
  horizon,
  config,
}: {
  me: Me | undefined;
  horizon: string;
  config: PublicConfig | undefined;
}) {
  const isTrial = me?.project.is_trial ?? false;
  return (
    <section className={styles.quickLinks} aria-labelledby="quick-links">
      <div className={styles.intro}>
        <h2 id="quick-links">Quick links</h2>
        <p>Here are some ways to get started:</p>
      </div>
      <div className={styles.quickGrid}>
        <LinkBlock title="Learn">
          <LinkRow>
            <AppLink href={STARTER} newTab>
              Tutorial: Cloud Starter Series
            </AppLink>
          </LinkRow>
          <LinkRow>
            <AppLink href={ALLOCATIONS_ARTICLE} newTab>
              Learn about allocations
            </AppLink>
          </LinkRow>
          <LinkRow>
            <AppLink href={LIVE_TRAINING_REGISTRATION} newTab>
              Register for live training
            </AppLink>
          </LinkRow>
          <LinkRow>
            <AppLink href={SECURITY_TUTORIAL} newTab>
              Tutorial: Security Practices on the Nectar Cloud
            </AppLink>
          </LinkRow>
        </LinkBlock>
        <LinkBlock title="Actions">
          <LinkRow>
            <AppLink to="/compute/instances/launch" search={{}}>
              Launch an instance
            </AppLink>
          </LinkRow>
          <LinkRow>
            <AppLink to="/reservations/new">Create a reservation</AppLink>
          </LinkRow>
          <LinkRow>
            <AppLink href={`${horizon}/allocation/user_requests/`}>
              Request an allocation
            </AppLink>
          </LinkRow>
        </LinkBlock>
        <LinkBlock title="View">
          <LinkRow>
            <AppLink to="/compute/overview">Compute overview</AppLink>
          </LinkRow>
          <LinkRow>
            <AppLink to="/usage/trend">Usage trend</AppLink>
          </LinkRow>
          {!isTrial && (
            <LinkRow>
              <AppLink to="/usage/allocation">Allocation usage</AppLink>
            </LinkRow>
          )}
          <LinkRow>
            <AppLink to="/members">Project members</AppLink>
          </LinkRow>
        </LinkBlock>
        <LinkBlock title="Support">
          <LinkRow>
            <AppLink
              href={config?.help_url ?? SUPPORT_LINKS.supportCentre}
              newTab
            >
              Nectar Support Centre
            </AppLink>
          </LinkRow>
          <LinkRow>
            <AppLink href={SUPPORT_LINKS.tutorials} newTab>
              Browse tutorials
            </AppLink>
          </LinkRow>
          <LinkRow>
            <AppLink href={SUPPORT_LINKS.status} newTab>
              Nectar system status
            </AppLink>
          </LinkRow>
          <LinkRow>
            <Button variant="link" onPress={() => openHelpWidget(config)}>
              Request help
            </Button>
          </LinkRow>
        </LinkBlock>
      </div>
    </section>
  );
}
