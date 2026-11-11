// The home page's block of the project's recent service unit use.
import { useQuery } from "@tanstack/react-query";
import { AppLink } from "../../components/AppLink/AppLink";
import { Skeleton } from "../../components/Skeleton/Skeleton";
import type { Me } from "../../lib/api/types/session";
import { formatSu } from "../../lib/format";
import { usageQuery } from "../../lib/queries";
import styles from "./HomePage.module.scss";

/**
 * The project's service unit use over the past three months, as an "Info -
 * Sidebar" block: the figure under its label, then the way to the usage
 * trend. A failed load shows "-".
 */
export function UsageBlock({ me }: { me: Me }) {
  const usage = useQuery(usageQuery(me.project.id));
  return (
    <section
      className={[styles.block, styles.usage].join(" ")}
      aria-labelledby="usage-heading"
    >
      <div className={styles.pair}>
        <h2 id="usage-heading" className={styles.pairTitle}>
          Service units used in the past 3 months
        </h2>
        <div className={styles.figure}>
          {usage.isPending ? (
            <Skeleton />
          ) : usage.isError ? (
            "-"
          ) : (
            formatSu(usage.data.sum)
          )}
        </div>
      </div>
      <p>To view more usage data, visit the Usage trend page.</p>
      <div className={styles.blockAction}>
        <AppLink to="/usage/trend" variant="primary" size="sm">
          Usage trend
        </AppLink>
      </div>
    </section>
  );
}
