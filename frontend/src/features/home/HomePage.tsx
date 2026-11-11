import { useQuery } from "@tanstack/react-query";
import { configQuery, meQuery } from "../../lib/queries";
import { useDocumentTitle } from "../../lib/hooks/useDocumentTitle";
import { Alerts } from "./Alerts";
import { Announcements } from "./Announcements";
import { FeaturedBanner } from "./FeaturedBanner";
import { Greeting } from "./Greeting";
import styles from "./HomePage.module.scss";
import { News } from "./News";
import { QuickLinks } from "./QuickLinks";
import { UsageBlock } from "./UsageBlock";
import { WelcomePanel } from "./WelcomePanel";

/**
 * The dashboard's landing page: the greeting and
 * notices, the welcome for new users, the featured banner, the quick links,
 * the project's recent usage beside the service announcements, then news.
 */
export function HomePage() {
  useDocumentTitle("Home");
  const { data: me } = useQuery(meQuery);
  const { data: config } = useQuery(configQuery);
  const horizon = config?.horizon_url?.replace(/\/$/, "") ?? "";

  return (
    <div className={styles.home}>
      <Greeting />
      <Alerts />
      <WelcomePanel config={config} />
      <FeaturedBanner config={config} />
      <QuickLinks me={me} horizon={horizon} config={config} />
      <div className={styles.usageRow}>
        {me && <UsageBlock me={me} />}
        <Announcements />
      </div>
      <News />
    </div>
  );
}
