// Usage Trend (nectar_dashboard/usage/trend): SU over a date range, by
// service, by instance, per day, and per instance in a table.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { parseDate } from "@internationalized/date";
import {
  Alert,
  DateRangePicker,
  Label,
  ToggleButtonGroup,
  ToggleButtonGroupItem,
} from "@ardc-ui/react";
import { BarList } from "../../components/Charts/BarList";
import { ChartFigure } from "../../components/Charts/ChartFigure";
import { LazyDailyLineChart } from "../../components/Charts/LazyDailyLineChart";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { Panel } from "../../components/Panel/Panel";
import { Skeleton, SkeletonLines } from "../../components/Skeleton/Skeleton";
import type { UsageInstance } from "../../lib/api/types";
import {
  formatCalendarDate,
  formatDate,
  formatNumber,
  formatSu,
} from "../../lib/format";
import { allocationQuery, meQuery, usageQuery } from "../../lib/queries";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { usageTrendRoute } from "../../app/router";
import { dailyPoints, peak } from "../compute/overview/usage";
import { usageInstancesQuery, usageOptionsQuery } from "./api";
import {
  activePreset,
  dailyGuide,
  daysAgo,
  isoDate,
  mostUsedItems,
  PRESETS,
  resolveRange,
  typeItems,
} from "./transform";
import styles from "./UsageTrendPage.module.scss";

const TREND_COLUMNS = [
  { id: "date", label: "Date" },
  { id: "value", label: "Service units", numeric: true },
];

export function UsageTrendPage() {
  const projectId = useProjectId();
  const { data: me } = useQuery(meQuery);
  const search = usageTrendRoute.useSearch();
  const navigate = useNavigate({ from: usageTrendRoute.fullPath });
  const options = useQuery(usageOptionsQuery);
  const dataFrom = options.data?.data_from ?? "2022-01-01";
  const range = useMemo(
    () => resolveRange(search, dataFrom),
    [search, dataFrom],
  );
  const { begin, end } = range;
  const preset = activePreset(begin, end, dataFrom);

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

  const columns = useMemo<ColumnDef<UsageInstance>[]>(
    () => [
      {
        id: "name",
        label: "Instance",
        isRowHeader: true,
        cell: (row) => (
          <span>
            {row.name}
            {row.display_name && (
              <span className={styles.muted}>
                {" "}
                <code>{row.id}</code>
              </span>
            )}
          </span>
        ),
        sortValue: (row) => row.name,
        textValue: (row) => `${row.name} ${row.id}`,
      },
      {
        id: "started",
        label: "Started",
        cell: (row) => formatDate(row.started_at),
        sortValue: (row) => row.started_at ?? "",
        hideBelow: "md",
      },
      {
        id: "ended",
        label: "Ended",
        cell: (row) => (row.ended_at ? formatDate(row.ended_at) : "Running"),
        sortValue: (row) => row.ended_at ?? "9999",
        hideBelow: "md",
      },
      {
        id: "zone",
        label: "Availability zone",
        cell: (row) => row.availability_zone ?? "",
        sortValue: (row) => row.availability_zone ?? "",
        hideBelow: "lg",
      },
      {
        id: "flavor",
        label: "Flavour",
        cell: (row) => row.flavor_name ?? "",
        sortValue: (row) => row.flavor_name ?? "",
        textValue: (row) => row.flavor_name ?? "",
        hideBelow: "lg",
      },
      {
        id: "hours",
        label: "Instance hours",
        cell: (row) => formatNumber(row.qty),
        sortValue: (row) => row.qty ?? 0,
        hideBelow: "md",
      },
      {
        id: "su",
        label: "SU",
        cell: (row) => formatSu(row.rate),
        sortValue: (row) => row.rate,
      },
    ],
    [],
  );

  const empty =
    instances.data && instances.data.items.length === 0 && points.length === 0;

  return (
    <>
      <PageHeader
        title="Usage Trend"
        crumbs={[{ label: "Project" }, { label: "Usage" }]}
      >
        <div className={styles.controls}>
          <DateRangePicker
            value={{ start: parseDate(begin), end: parseDate(end) }}
            onChange={(value) => {
              if (value) {
                setRange({
                  begin: value.start.toString(),
                  end: value.end.toString(),
                });
              }
            }}
            minValue={parseDate(dataFrom)}
            maxValue={parseDate(isoDate(new Date()))}
            className={styles.range}
          >
            <Label>Date range</Label>
          </DateRangePicker>
          <ToggleButtonGroup
            selectionMode="single"
            selectedKeys={preset ? new Set([preset]) : new Set()}
            onSelectionChange={(keys) => {
              const [key] = keys;
              const chosen = PRESETS.find((p) => p.id === key);
              if (chosen) {
                setRange({
                  begin: daysAgo(chosen.days),
                  end: isoDate(new Date()),
                });
              }
            }}
            aria-label="Date range presets"
            className={styles.presets}
          >
            {PRESETS.map((item) => (
              <ToggleButtonGroupItem key={item.id} id={item.id}>
                {item.label}
              </ToggleButtonGroupItem>
            ))}
          </ToggleButtonGroup>
        </div>
        <p className={styles.note}>
          Service unit (SU) data is available from{" "}
          {formatCalendarDate(dataFrom)}. Figures for the current day are
          incomplete.
        </p>
      </PageHeader>
      <div className={styles.grid}>
        <Panel title="Service units used" className={styles.total}>
          {instances.isPending ? (
            <Skeleton width="6rem" height="2.5rem" />
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
            columns={columns}
            rows={instances.data?.items}
            getRowId={(row) => row.id}
            isLoading={instances.isPending}
            isFetching={instances.isFetching}
            error={instances.error}
            onRetry={() => void instances.refetch()}
            emptyTitle={
              empty ? "No instances ran in this range" : "No usage rows"
            }
            defaultSort={{ column: "su", direction: "descending" }}
          />
        </div>
      </div>
    </>
  );
}
