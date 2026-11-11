// The home page's panel of the latest ARDC news.
import { useQuery } from "@tanstack/react-query";
import { AppLink } from "../../components/AppLink/AppLink";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { newsQuery } from "../../lib/queries";
import { ARDC_NEWS } from "./data/links";
import styles from "./HomePage.module.scss";
import { NewsCard } from "./NewsCard";

const NEWS_LIMIT = 6;

/**
 * The six latest ARDC news articles as cards in a grid, with the way to all
 * news on the ARDC site. A failed feed says news is unavailable.
 */
export function News() {
  const news = useQuery(newsQuery);
  return (
    <Panel
      title="ARDC news"
      actions={
        <AppLink href={ARDC_NEWS} newTab size="sm">
          View all news
        </AppLink>
      }
    >
      {news.isPending ? (
        <SkeletonLines />
      ) : news.isError ? (
        <EmptyState title="News is unavailable right now." />
      ) : (
        <ul className={styles.newsGrid}>
          {news.data.items.slice(0, NEWS_LIMIT).map((item) => (
            <li key={item.link} className={styles.newsCell}>
              <NewsCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
