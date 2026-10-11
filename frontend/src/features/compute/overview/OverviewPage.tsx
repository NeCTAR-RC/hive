import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { Link } from "@ardc-ui/react";
import { ChartFigure } from "../../../components/Charts/ChartFigure";
import { LazyDailyLineChart } from "../../../components/Charts/LazyDailyLineChart";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { Panel } from "../../../components/Panel/Panel";
import { QuotaMeter } from "../../../components/QuotaMeter/QuotaMeter";
import { Skeleton, SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { ComputeLimits } from "../../../lib/api/types";
import { formatCalendarDate, formatSu } from "../../../lib/format";
import { configQuery, risksQuery, usageQuery } from "../../../lib/queries";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { instancesQuery, limitsQuery } from "../api";
import { statusTone } from "../instances/status";
import styles from "./OverviewPage.module.scss";
import { dailyPoints, peak } from "./usage";

function meter(limits: ComputeLimits, maxKey: string, usedKey: string) {
  const max = limits[maxKey];
  const used = limits[usedKey] ?? 0;
  return { max: max === undefined ? null : max, used };
}

const TREND_COLUMNS = [
  { id: "date", label: "Date" },
  { id: "value", label: "Service units", numeric: true },
];

export function OverviewPage() {
  const projectId = useProjectId();
  const { data: config } = useQuery(configQuery);
  const limits = useQuery(limitsQuery(projectId));
  // One row per day for the past 3 months, as nectar-dashboard's overview
  // (groupby=time-1d) draws it.
  const trend = useQuery(usageQuery(projectId, { groupby: "time-1d" }));
  const risks = useQuery(risksQuery(projectId));
  const instances = useQuery(instancesQuery(projectId));
  const horizon = config?.horizon_url?.replace(/\/$/, "") ?? "";

  const byStatus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const instance of instances.data?.items ?? []) {
      counts.set(instance.status, (counts.get(instance.status) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [instances.data]);

  const points = useMemo(() => dailyPoints(trend.data?.data), [trend.data]);
  const busiest = peak(points);
  const summary = trend.data
    ? `Daily service unit usage from ${formatCalendarDate(trend.data.begin)} to ${formatCalendarDate(trend.data.end)}: ${formatSu(trend.data.sum)} in total` +
      (busiest
        ? `, peaking at ${formatSu(busiest.value)} on ${formatCalendarDate(busiest.date)}.`
        : ".")
    : "";
  const rows = useMemo(
    () =>
      points.map((point) => ({
        date: formatCalendarDate(point.date),
        value: formatSu(point.value),
      })),
    [points],
  );

  return (
    <>
      <PageHeader
        title="Overview"
        crumbs={[{ label: "Project" }, { label: "Compute" }]}
        actions={
          <Link variant="primary" size="sm" href="/compute/instances/launch">
            Launch instance
          </Link>
        }
      />
      <div className={styles.grid}>
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
                  <p className={styles.noUsage}>
                    There is no usage data recorded because no instances were
                    running. Do you want to{" "}
                    <RouterLink to="/compute/instances/launch" search={{}}>
                      launch an instance
                    </RouterLink>
                    ?
                  </p>
                ) : (
                  <ChartFigure
                    title="Service units per day"
                    summary={summary}
                    columns={TREND_COLUMNS}
                    rows={rows}
                  >
                    <LazyDailyLineChart
                      data={points}
                      valueLabel="Service units"
                    />
                  </ChartFigure>
                )}
              </div>
              <div className={styles.trendTotal}>
                <p className={styles.usageLabel}>You have used</p>
                <p className={styles.usageValue}>{formatSu(trend.data.sum)}</p>
                <p className={styles.usageLabel}>
                  service units in the past 3 months.
                </p>
                <p className={styles.muted}>
                  To view more usage data, visit the Usage Trend page.
                </p>
                <Link
                  variant="secondary"
                  size="sm"
                  href={`${horizon}/project/usage-trend/`}
                >
                  Usage Trend
                </Link>
              </div>
            </div>
          )}
        </Panel>
        <Panel title="Compute quota">
          {limits.isPending ? (
            <SkeletonLines lines={4} />
          ) : limits.isError ? (
            <ErrorState
              error={limits.error}
              onRetry={() => void limits.refetch()}
            />
          ) : (
            <div className={styles.meters}>
              {(() => {
                const inst = meter(
                  limits.data,
                  "maxTotalInstances",
                  "totalInstancesUsed",
                );
                const cores = meter(
                  limits.data,
                  "maxTotalCores",
                  "totalCoresUsed",
                );
                const ram = meter(
                  limits.data,
                  "maxTotalRAMSize",
                  "totalRAMUsed",
                );
                const groups = meter(
                  limits.data,
                  "maxServerGroups",
                  "totalServerGroupsUsed",
                );
                return (
                  <>
                    <QuotaMeter
                      label="Instances"
                      value={inst.used}
                      max={inst.max}
                      valueText={`${inst.used} of ${inst.max === null || inst.max < 0 ? "unlimited" : inst.max}`}
                    />
                    <QuotaMeter
                      label="vCPUs"
                      value={cores.used}
                      max={cores.max}
                      valueText={`${cores.used} of ${cores.max === null || cores.max < 0 ? "unlimited" : cores.max}`}
                    />
                    <QuotaMeter
                      label="RAM"
                      value={ram.used}
                      max={ram.max}
                      valueText={`${Math.round(ram.used / 1024)} GB of ${ram.max === null || ram.max < 0 ? "unlimited" : `${Math.round(ram.max / 1024)} GB`}`}
                    />
                    <QuotaMeter
                      label="Server groups"
                      value={groups.used}
                      max={groups.max}
                      valueText={`${groups.used} of ${groups.max === null || groups.max < 0 ? "unlimited" : groups.max}`}
                    />
                  </>
                );
              })()}
            </div>
          )}
        </Panel>
        <Panel title="Instances">
          {instances.isPending ? (
            <SkeletonLines lines={3} />
          ) : instances.isError ? (
            <ErrorState
              error={instances.error}
              onRetry={() => void instances.refetch()}
            />
          ) : byStatus.length === 0 ? (
            <p className={styles.muted}>
              No instances yet.{" "}
              <RouterLink to="/compute/instances/launch" search={{}}>
                Launch one
              </RouterLink>
              .
            </p>
          ) : (
            <ul className={styles.statusList}>
              {byStatus.map(([status, count]) => (
                <li key={status}>
                  <RouterLink to="/compute/instances" search={{ status }}>
                    <StatusPill
                      tone={statusTone({ status, task_state: null } as never)}
                    >
                      {status.replace(/_/g, " ")}
                    </StatusPill>
                    <span className={styles.count}>{count}</span>
                  </RouterLink>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Security risks" className={styles.wide}>
          {risks.isPending ? (
            <SkeletonLines lines={2} />
          ) : !risks.data?.available ? (
            <p className={styles.muted}>
              Security risk information is unavailable.
            </p>
          ) : risks.data.items.length === 0 ? (
            <p>No security risks have been detected for this project.</p>
          ) : (
            <p>
              <StatusPill tone="danger">{`${risks.data.items.length} ${risks.data.items.length === 1 ? "risk" : "risks"}`}</StatusPill>{" "}
              <a href={`${horizon}/project/security/`}>Review security risks</a>
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
