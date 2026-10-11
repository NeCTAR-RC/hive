import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Link } from "@ardc-ui/react";
import { useState } from "react";
import { ExternalLink } from "../../components/ExternalLink/ExternalLink";
import { Panel } from "../../components/Panel/Panel";
import { Skeleton, SkeletonLines } from "../../components/Skeleton/Skeleton";
import type { Me, Outage, PublicConfig } from "../../lib/api/types";
import { formatDate, formatSu } from "../../lib/format";
import {
  bannerQuery,
  configQuery,
  meQuery,
  newsQuery,
  outagesQuery,
  profileQuery,
  risksQuery,
  usageQuery,
} from "../../lib/queries";
import { readLocal, writeLocal } from "../../lib/storage";
import { openHelpWidget } from "../../lib/help";
import { SUPPORT_LINKS } from "../../shell/ArdcHeader/menu-data";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import styles from "./HomePage.module.scss";

const WELCOME_KEY = "welcomeDismissed";
const VIDEO = "https://www.youtube-nocookie.com/embed/p-i1W6uFGRA";
const STARTER = "https://tutorials.rc.nectar.org.au/cloud-starter/01-overview";

export function HomePage() {
  useDocumentTitle("Home");
  const { data: me } = useQuery(meQuery);
  const { data: config } = useQuery(configQuery);
  const horizon = config?.horizon_url?.replace(/\/$/, "") ?? "";

  return (
    <div className={styles.home}>
      <Greeting />
      <OutageAlerts config={config} />
      {me && <RiskAlert me={me} />}
      <WelcomePanel config={config} />
      <Banner config={config} />
      <div className={styles.row}>
        <QuickLinks me={me} horizon={horizon} config={config} />
        {me && <UsageTile me={me} />}
      </div>
      <Announcements />
      <News />
    </div>
  );
}

function Greeting() {
  const { data } = useQuery(profileQuery);
  const name = data && !data.partial ? data.first_name : "";
  return (
    <h1 tabIndex={-1} className={styles.greeting}>
      {name ? `Hello ${name}!` : "Hello and Welcome!"}
    </h1>
  );
}

function outageTone(outage: Outage): "warning" | "danger" | null {
  if (outage.end || outage.cancelled) return null;
  if (outage.severity >= 3) return "danger";
  if (outage.severity === 2) return "warning";
  return null;
}

function OutageAlerts({ config }: { config: PublicConfig | undefined }) {
  const { data } = useQuery(outagesQuery);
  const alerts = (data?.items ?? []).flatMap((outage) => {
    const tone = outageTone(outage);
    return tone ? [{ outage, tone }] : [];
  });
  if (alerts.length === 0) return null;
  return (
    <div className={styles.stack}>
      {alerts.map(({ outage, tone }) => (
        <Alert key={outage.id} tone={tone} role="status">
          <strong>{outage.scheduled ? "Scheduled outage" : "Outage"}:</strong>{" "}
          {outage.title}
          {outage.status_display ? ` (${outage.status_display})` : ""}.{" "}
          <a href={outage.url}>Details</a>
          {config?.outage_base_url ? "" : null}
        </Alert>
      ))}
    </div>
  );
}

function RiskAlert({ me }: { me: Me }) {
  const { data } = useQuery(risksQuery(me.project.id));
  const count = data?.items.length ?? 0;
  if (count === 0) return null;
  return (
    <Alert tone="danger" role="status">
      <strong>Security risks detected:</strong> {count}{" "}
      {count === 1 ? "resource needs" : "resources need"} attention.{" "}
      <a href="/security/risks">Review security risks</a>
    </Alert>
  );
}

function WelcomePanel({ config }: { config: PublicConfig | undefined }) {
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
      <div className={styles.welcomeGrid}>
        <div className={styles.video}>
          <iframe
            src={VIDEO}
            title="Introduction to the Nectar Research Cloud dashboard"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
          />
        </div>
        <div className={styles.welcomeText}>
          <h2 id="welcome-heading">Welcome to the Dashboard!</h2>
          <p className={styles.lead}>
            <em>The Dashboard</em> is your web interface to the{" "}
            <strong>ARDC Nectar Research Cloud</strong>, Australia&apos;s
            national research cloud, giving you access to powerful computing
            resources without the need to purchase or host your own hardware.
          </p>
          <p>
            New to Nectar? There are support articles and tutorials to help you
            along the way, and if you need help you can contact the Support team
            by creating a help request.
          </p>
          <div className={styles.welcomeButtons}>
            <Link
              variant="primary"
              size="sm"
              href={config?.help_url ?? SUPPORT_LINKS.supportCentre}
            >
              Support Centre
            </Link>
            <Link variant="secondary" size="sm" href={SUPPORT_LINKS.tutorials}>
              Tutorials
            </Link>
            <Link
              variant="secondary"
              size="sm"
              href="https://support.ehelp.edu.au/support/solutions/articles/6000156761-learning-and-training-resources/"
            >
              Live Training
            </Link>
          </div>
          <p>
            To get started with the Nectar Cloud, we recommend following the{" "}
            <a href={STARTER}>Cloud Starter Series</a> of tutorials.
          </p>
        </div>
      </div>
      <Button
        variant="link"
        size="xs"
        className={styles.dismiss}
        onPress={dismiss}
      >
        Dismiss
      </Button>
    </section>
  );
}

function Banner({ config }: { config: PublicConfig | undefined }) {
  const { data } = useQuery({
    ...bannerQuery(config?.banner_url ?? null),
    enabled: Boolean(config?.banner_url),
  });
  if (!data || !data.title) return null;
  return (
    <section className={styles.banner} aria-label="Featured">
      {data.image && (
        <img src={data.image} alt="" className={styles.bannerImage} />
      )}
      <div>
        <h2>{data.title}</h2>
        {data.description && <p>{data.description}</p>}
        {data.link && (
          <Link variant="primary" size="sm" href={data.link}>
            {data.link_text ?? "Find out more"}
          </Link>
        )}
      </div>
    </section>
  );
}

function QuickLinks({
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
    <Panel title="Quick links" className={styles.quick}>
      <h3 className={styles.quickIntro}>Here are some ways to get started:</h3>
      <div className={styles.quickColumns}>
        <div>
          <h4>Learn</h4>
          <ul>
            <li>
              <a href={STARTER}>Tutorial: Cloud Starter Series</a>
            </li>
            <li>
              <a href="https://support.ehelp.edu.au/support/solutions/articles/6000171494">
                Learn about allocations
              </a>
            </li>
            <li>
              <a href="https://support.ehelp.edu.au/support/solutions/articles/6000156761">
                Register for live training
              </a>
            </li>
            <li>
              <a href="https://tutorials.rc.nectar.org.au/security_nectar_cloud/01-overview">
                Tutorial: Security Practices on the Nectar Cloud
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h4>Actions</h4>
          <ul>
            <li>
              <a href="/compute/instances/launch">Launch an instance</a>
            </li>
            <li>
              <a href="/reservations/new">Create a reservation</a>
            </li>
            <li>
              <a href={`${horizon}/allocation/user_requests/`}>
                Request an allocation
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h4>View</h4>
          <ul>
            <li>
              <a href="/compute/overview">Compute Overview</a>
            </li>
            <li>
              <a href="/usage/trend">Usage Trend</a>
            </li>
            {!isTrial && (
              <li>
                <a href="/usage/allocation">Allocation Usage</a>
              </li>
            )}
            <li>
              <a href="/members">Project Members</a>
            </li>
          </ul>
        </div>
        <div>
          <h4>Support</h4>
          <ul>
            <li>
              <a href={config?.help_url ?? SUPPORT_LINKS.supportCentre}>
                Nectar Support Centre
              </a>
            </li>
            <li>
              <a href={SUPPORT_LINKS.tutorials}>Browse Tutorials</a>
            </li>
            <li>
              <a href={SUPPORT_LINKS.status}>Nectar System Status</a>
            </li>
            <li>
              <Button
                variant="link"
                size="sm"
                onPress={() => openHelpWidget(config)}
              >
                Request Help
              </Button>
            </li>
          </ul>
        </div>
      </div>
    </Panel>
  );
}

function UsageTile({ me }: { me: Me }) {
  const usage = useQuery(usageQuery(me.project.id));
  return (
    <Panel title="Usage" className={styles.usage}>
      <div className={styles.usageBody}>
        <p className={styles.usageLabel}>You have used</p>
        {usage.isPending ? (
          <Skeleton width="6rem" height="2.5rem" />
        ) : (
          <p className={styles.usageValue}>
            {usage.isError ? "—" : formatSu(usage.data.sum)}
          </p>
        )}
        <p className={styles.usageLabel}>Service Units in the past 3 months.</p>
        <p>To view more usage data, visit the Usage Trend page.</p>
        <Link variant="primary" size="sm" href="/usage/trend">
          Usage Trend
        </Link>
      </div>
    </Panel>
  );
}

function Announcements() {
  const { data, isPending } = useQuery(outagesQuery);
  const items = data?.items ?? [];
  if (!isPending && items.length === 0) return null;
  return (
    <Panel
      title="Service announcements"
      actions={
        <ExternalLink href={SUPPORT_LINKS.status}>
          Nectar System Status
        </ExternalLink>
      }
      className={styles.announcements}
    >
      {isPending ? (
        <SkeletonLines lines={3} />
      ) : (
        <ul className={styles.announcementList}>
          {items.map((outage) => (
            <li key={outage.id}>
              <a href={outage.url}>{outage.title}</a>
              <span className={styles.meta}>
                {[
                  outage.scheduled_display,
                  outage.status_display,
                  formatDate(outage.start),
                ]
                  .filter(Boolean)
                  .join(" | ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function News() {
  const news = useQuery(newsQuery);
  return (
    <Panel
      title="ARDC news"
      actions={
        <ExternalLink href="https://ardc.edu.au/news-and-events/news/">
          View all news
        </ExternalLink>
      }
      className={styles.news}
    >
      {news.isPending ? (
        <SkeletonLines lines={4} />
      ) : news.isError ? (
        <p className={styles.meta}>News is unavailable right now.</p>
      ) : (
        <ul className={styles.newsList}>
          {news.data.items.slice(0, 6).map((item) => (
            <li key={item.link} className={styles.newsItem}>
              {item.image && (
                <img src={item.image} alt="" className={styles.newsImage} />
              )}
              <div>
                <p className={styles.meta}>
                  {formatDate(item.published) || item.published}
                </p>
                <a href={item.link} className={styles.newsTitle}>
                  {item.title}
                </a>
                {item.summary && (
                  <p className={styles.newsSummary}>{item.summary}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
