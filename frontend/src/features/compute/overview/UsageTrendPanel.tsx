// The compute overview's usage trend panel: daily service units for the
// past 3 months and their total.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Link } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import { ChartFigure } from "../../../components/Charts/ChartFigure";
import { LazyDailyLineChart } from "../../../components/Charts/LazyDailyLineChart";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { Panel } from "../../../components/Panel/Panel";
import { Skeleton } from "../../../components/Skeleton/Skeleton";
import { formatCalendarDate, formatSu } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { usageQuery } from "../../../lib/queries";
import styles from "./OverviewPage.module.scss";
import { dailyPoints, peak, trendSummary } from "./usage";

const TREND_COLUMNS = [
  { id: "date", label: "Date" },
  { id: "value", label: "Service units", numeric: true },
];

/**
 * The past 3 months of service units per day as a chart (with its table
 * and spoken summary), the total, and a link to the Usage trend page,
 * which breaks usage down by instance over any range. With no usage
 * recorded it suggests launching an instance.
 */
export function UsageTrendPanel() {
  const projectId = useProjectId();
  // One row per day for the past 3 months, as nectar-dashboard's overview
  // (groupby=time-1d) draws it.
  const trend = useQuery(usageQuery(projectId, { groupby: "time-1d" }));

  const points = useMemo(() => dailyPoints(trend.data?.data), [trend.data]);
  const busiest = peak(points);
  const summary = trend.data ? trendSummary(trend.data, busiest) : "";
  const rows = useMemo(
    () =>
      points.map((point) => ({
        date: formatCalendarDate(point.date),
        value: formatSu(point.value),
      })),
    [points],
  );

  return (
    <Panel title="Past 3 months usage trend" className={styles.wide}>
      {trend.isPending ? (
        <Skeleton height="12rem" />
      ) : trend.isError ? (
        <ErrorState
          error={trend.error}
          title="Usage is unavailable"
          onRetry={() => void trend.refetch()}
        />
      ) : (
        <div className={styles.trend}>
          <div className={styles.trendChart}>
            {points.length === 0 ? (
              <Alert tone="warning">
                There is no usage data recorded because no instances were
                running. Do you want to{" "}
                <AppLink to="/compute/instances/launch" search={{}} size="xs">
                  launch an instance
                </AppLink>
                ?
              </Alert>
            ) : (
              <ChartFigure
                title="Service units per day"
                summary={summary}
                columns={TREND_COLUMNS}
                rows={rows}
              >
                <LazyDailyLineChart data={points} valueLabel="Service units" />
              </ChartFigure>
            )}
          </div>
          <div className={styles.trendTotal}>
            <div className={styles.pair}>
              <p className={styles.pairTitle}>
                Service units used in the past 3 months
              </p>
              <p className={styles.figure}>{formatSu(trend.data.sum)}</p>
            </div>
            <p className={styles.text}>
              To see each instance&apos;s usage over any date range, visit the
              Usage trend page.
            </p>
            <div className={styles.action}>
              <Link variant="secondary" size="sm" href="/usage/trend">
                Usage trend
              </Link>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
