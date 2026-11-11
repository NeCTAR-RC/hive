// Allocation Usage (nectar_dashboard/usage/allocation_usage): the SU
// budget burn-down for the current allocation.
import { useQuery } from "@tanstack/react-query";
import { Alert, Card, Link } from "@ardc-ui/react";
import { AppLink } from "../../components/AppLink/AppLink";
import { ChartFigure } from "../../components/Charts/ChartFigure";
import { LazyBurnDownChart } from "../../components/Charts/LazyBurnDownChart";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { formatCalendarDate, formatNumber, formatSu } from "../../lib/format";
import { useProjectId } from "../../lib/hooks/useProjectId";
import { configQuery, meQuery } from "../../lib/queries";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { allocationUsageQuery } from "./api";
import styles from "./AllocationUsagePage.module.scss";
import { guideAt } from "./transform";

const COLUMNS = [
  { id: "date", label: "Date" },
  { id: "used", label: "Service units used", numeric: true },
  { id: "guide", label: "Usage guide", numeric: true },
];

/**
 * The current allocation's service unit budget: the headline figures, a
 * warning when usage runs above the on-track figure, and the cumulative
 * use against the budget guide. Tenant managers get the way to request
 * more budget.
 */
export function AllocationUsagePage() {
  const projectId = useProjectId();
  const { data: me } = useQuery(meQuery);
  const { data: config } = useQuery(configQuery);
  const usage = useQuery(allocationUsageQuery(projectId));
  const horizon = config?.horizon_url?.replace(/\/$/, "") ?? "";
  const requestUrl = `${horizon}/allocation/user_requests/`;

  return (
    <>
      <PageHeader
        title="Allocation usage"
        crumbs={[{ label: "Project" }, { label: "Usage" }]}
        actions={
          me?.capabilities.tenantmanager ? (
            <Link variant="secondary" size="sm" href={requestUrl}>
              Request more budget
            </Link>
          ) : null
        }
      />
      {usage.isPending ? (
        <SkeletonLines lines={6} />
      ) : usage.isError ? (
        <ErrorState error={usage.error} onRetry={() => usage.refetch()} />
      ) : !usage.data.available ? (
        <EmptyState title="No allocation usage to show">
          <p>{usage.data.reason}</p>
        </EmptyState>
      ) : (
        <div className={styles.stack}>
          <p className={styles.lead}>
            <strong>{formatSu(usage.data.su_budget)} SU</strong> budget for the
            allocation from{" "}
            {formatCalendarDate(usage.data.allocation?.start_date)} to{" "}
            {formatCalendarDate(usage.data.allocation?.end_date)}.
          </p>
          {usage.data.at_risk && (
            <Alert tone="warning" role="status">
              <strong>This project is at risk of running out of budget.</strong>{" "}
              Usage so far is {formatSu(usage.data.budget_tracking)} SU above
              the on-track figure for today.
              {me?.capabilities.tenantmanager && (
                <>
                  {" "}
                  <AppLink href={requestUrl} size="xs">
                    Request more budget
                  </AppLink>
                  .
                </>
              )}
            </Alert>
          )}
          <div className={styles.tiles}>
            <Tile label="SU used" value={formatSu(usage.data.su_used)} />
            <Tile
              label="SU remaining"
              value={formatSu(usage.data.su_remaining)}
            />
            <Tile
              label="Instance hours"
              value={formatNumber(usage.data.total_hours)}
            />
            <Tile
              label="Daily budget"
              value={
                usage.data.day_budget === null ||
                usage.data.day_budget === undefined
                  ? "-"
                  : `${formatSu(usage.data.day_budget)} SU`
              }
            />
          </div>
          <Panel title="Budget burn-down">
            <ChartFigure
              title="Service units used against the budget guide"
              summary={`Cumulative service units from ${formatCalendarDate(usage.data.allocation?.start_date)}: ${formatSu(usage.data.su_used)} used of ${formatSu(usage.data.su_budget)}, ${usage.data.at_risk ? "above" : "within"} the on-track figure of ${formatSu(usage.data.on_track)}.`}
              columns={COLUMNS}
              rows={(usage.data.cumulative ?? [])
                .filter((point) => point.value !== null)
                .map((point) => ({
                  date: formatCalendarDate(point.date),
                  used: formatNumber(point.value),
                  guide: formatNumber(
                    guideAt(point.date, usage.data.guide ?? []),
                  ),
                }))}
              height={320}
            >
              <LazyBurnDownChart
                cumulative={usage.data.cumulative ?? []}
                guide={usage.data.guide ?? []}
                usedLabel="Service units used"
                guideLabel="Usage guide"
              />
            </ChartFigure>
          </Panel>
        </div>
      )}
    </>
  );
}

/**
 * One headline figure on the library `Card` in its grey tone as shipped:
 * its label over the figure, as the home page's usage figure reads.
 */
function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card tone="grey">
      <div className={styles.tile}>
        <p className={styles.tileLabel}>{label}</p>
        <p className={styles.tileValue}>{value}</p>
      </div>
    </Card>
  );
}
