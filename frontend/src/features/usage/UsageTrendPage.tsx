// Usage Trend (nectar_dashboard/usage/trend): SU over a date range, by
// service, by instance, per day, and per instance in a table.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Alert, Button } from "@ardc-ui/react";
import { BarList } from "../../components/Charts/BarList";
import { ChartFigure } from "../../components/Charts/ChartFigure";
import { LazyDailyLineChart } from "../../components/Charts/LazyDailyLineChart";
import { DataTable } from "../../components/DataTable/DataTable";
import { useQueryTable } from "../../components/DataTable/useQueryTable";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { Panel } from "../../components/Panel/Panel";
import { Skeleton, SkeletonLines } from "../../components/Skeleton/Skeleton";
import { downloadText } from "../../lib/download";
import { formatCalendarDate, formatNumber, formatSu } from "../../lib/format";
import { useProjectId } from "../../lib/hooks/useProjectId";
import { allocationQuery, meQuery, usageQuery } from "../../lib/queries";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { dailyPoints, peak } from "../compute/overview/usage";
import { usageInstancesQuery, usageOptionsQuery } from "./api";
import { usageCsv, usageCsvName } from "./csv";
import { RangeControls } from "./RangeControls";
import {
  dailyGuide,
  localToday,
  mostUsedItems,
  resolveRange,
  typeItems,
} from "./transform";
import { usageInstanceColumns } from "./usageInstanceColumns";
import styles from "./UsageTrendPage.module.scss";

const usageTrendRoute = getRouteApi("/app/usage/trend");

const TREND_COLUMNS = [
  { id: "date", label: "Date" },
  { id: "value", label: "Service units", numeric: true },
];

/**
 * The project's service unit use over a chosen range: the total, the split
 * by service and by instance, the daily line against the allocation's
 * daily guide, and a table of every instance that ran, which downloads as
 * CSV. The range lives in the URL search.
 */
export function UsageTrendPage() {
  const projectId = useProjectId();
  const { data: me } = useQuery(meQuery);
  const search = usageTrendRoute.useSearch();
  const navigate = usageTrendRoute.useNavigate();
  const options = useQuery(usageOptionsQuery);
  const dataFrom = options.data?.data_from ?? "2022-01-01";
  const today = localToday();
  const range = useMemo(
    () => resolveRange(search, dataFrom, today),
    [search, dataFrom, today],
  );
  const { begin, end } = range;

  const instances = useQuery(usageInstancesQuery(projectId, begin, end));
  const byType = useQuery(
    usageQuery(projectId, { begin, end, groupby: "type" }),
  );
  const daily = useQuery(
    usageQuery(projectId, { begin, end, groupby: "time-1d" }),
  );
  const allocation = useQuery({
    ...allocationQuery(projectId),
    enabled: Boolean(me && !me.project.is_trial),
  });

  const setRange = (next: { begin: string; end: string }) =>
    void navigate({ search: next, replace: true });

  const points = useMemo(() => dailyPoints(daily.data?.data), [daily.data]);
  const guide = dailyGuide(allocation.data);
  const busiest = peak(points);
  const summary = busiest
    ? `Service units per day from ${formatCalendarDate(begin)} to ${formatCalendarDate(end)}, peaking at ${formatNumber(busiest.value)} on ${formatCalendarDate(busiest.date)}.`
    : "No daily usage in the selected range.";
  const trendRows = points.map((point) => ({
    date: formatCalendarDate(point.date),
    value: formatNumber(point.value),
  }));

  const empty =
    instances.data && instances.data.items.length === 0 && points.length === 0;
  const downloadCsv = () => {
    if (!instances.data) return;
    downloadText(
      usageCsvName(me?.project.name ?? projectId, begin, end),
      usageCsv(instances.data.items),
      "text/csv",
    );
  };
  const instancesTable = useQueryTable(instances, {
    noun: "usage rows",
    emptyTitle: empty ? "No instances ran in this range" : "No usage rows",
    refresh: false,
  });

  return (
    <>
      <PageHeader
        title="Usage trend"
        crumbs={[{ label: "Project" }, { label: "Usage" }]}
      >
        <RangeControls
          begin={begin}
          end={end}
          dataFrom={dataFrom}
          today={today}
          onChange={setRange}
        />
        <p className={styles.note}>
          Service unit (SU) data is available from{" "}
          {formatCalendarDate(dataFrom)}. Figures for the current day are
          incomplete.
        </p>
      </PageHeader>
      <div className={styles.grid}>
        <Panel title="Service units used" className={styles.total}>
          {instances.isPending ? (
            <p className={styles.totalValue}>
              <Skeleton width="5ch" height="1lh" />
            </p>
          ) : instances.isError ? (
            <ErrorState
              error={instances.error}
              onRetry={() => instances.refetch()}
            />
          ) : (
            <>
              <p className={styles.totalValue}>
                {formatSu(instances.data.sum)}
              </p>
              <p className={styles.muted}>
                from {formatCalendarDate(begin)} to {formatCalendarDate(end)}
              </p>
              {instances.data.partial && (
                <Alert tone="warning" role="status">
                  Instance names are unavailable at the moment; identifiers are
                  shown instead.
                </Alert>
              )}
            </>
          )}
        </Panel>
        <Panel title="Usage by service">
          {byType.isPending ? (
            <SkeletonLines lines={3} />
          ) : byType.isError ? (
            <ErrorState error={byType.error} onRetry={() => byType.refetch()} />
          ) : typeItems(byType.data.data).length === 0 ? (
            <p className={styles.muted}>No usage in this range.</p>
          ) : (
            <BarList
              items={typeItems(byType.data.data)}
              unit="SU"
              aria-label="Service units by service"
            />
          )}
        </Panel>
        <Panel title="Usage by instance">
          {instances.isPending ? (
            <SkeletonLines lines={5} />
          ) : instances.isError ? (
            <p className={styles.muted}>Unavailable.</p>
          ) : mostUsedItems(instances.data.most_used).length === 0 ? (
            <p className={styles.muted}>
              There is no usage data recorded for the selected date range
              because there weren&apos;t any instances running.
            </p>
          ) : (
            <>
              <p className={styles.muted}>
                {instances.data.most_used.count}{" "}
                {instances.data.most_used.count === 1
                  ? "instance was"
                  : "instances were"}{" "}
                running. The five largest are shown.
              </p>
              <BarList
                items={mostUsedItems(instances.data.most_used)}
                unit="SU"
                aria-label="Service units by instance"
              />
            </>
          )}
        </Panel>
        <Panel title="Usage summary" className={styles.wide}>
          {daily.isPending ? (
            <Skeleton height="16rem" />
          ) : daily.isError ? (
            <ErrorState error={daily.error} onRetry={() => daily.refetch()} />
          ) : points.length === 0 ? (
            <p className={styles.muted}>
              There is no usage data recorded for the selected date range
              because there weren&apos;t any instances running.
            </p>
          ) : (
            <ChartFigure
              title="Service units per day"
              summary={summary}
              columns={TREND_COLUMNS}
              rows={trendRows}
            >
              <LazyDailyLineChart
                data={points}
                valueLabel="Service units"
                {...(guide ? { guide } : {})}
              />
            </ChartFigure>
          )}
        </Panel>
        <div className={styles.wide}>
          <DataTable
            id="usage-instances"
            label="Project usage breakdown"
            columns={usageInstanceColumns}
            getRowId={(row) => row.id}
            {...instancesTable}
            toolbarActions={
              <Button
                variant="secondary"
                size="xs"
                onPress={downloadCsv}
                isDisabled={!instances.data?.items.length}
              >
                Download CSV
              </Button>
            }
            defaultSort={{ column: "su", direction: "descending" }}
          />
        </div>
      </div>
    </>
  );
}
