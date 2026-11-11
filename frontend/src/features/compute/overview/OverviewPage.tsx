// The compute overview: the usage trend, the limit summary (compute,
// volume and network quotas), the instances by status and the project's
// security risks.
import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Link } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { Panel } from "../../../components/Panel/Panel";
import { QuotaMeter } from "../../../components/QuotaMeter/QuotaMeter";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { formatNumber } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { risksQuery } from "../../../lib/queries";
import { enumLabel } from "../../../lib/status";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { networkQuotaQuery } from "../../network/api";
import { volumeLimitsQuery } from "../../volumes/api";
import { instancesQuery, limitsQuery } from "../api";
import { statusTone } from "../instances/status";
import styles from "./OverviewPage.module.scss";
import {
  computeQuotas,
  networkQuotas,
  volumeQuotas,
  type QuotaFigure,
} from "./quotas";
import { UsageTrendPanel } from "./UsageTrendPanel";

/**
 * One group of the limit summary: its meters once the service's limits
 * load, with the failure and a retry in their place if they do not.
 */
function QuotaPanel<T>({
  title,
  query,
  figures,
}: {
  title: string;
  query: UseQueryResult<T>;
  figures: (data: T) => QuotaFigure[];
}) {
  return (
    <Panel title={title}>
      {query.isPending ? (
        <SkeletonLines lines={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className={styles.meters}>
          {figures(query.data).map((quota) => (
            <QuotaMeter
              key={quota.label}
              label={quota.label}
              value={quota.used}
              max={quota.max}
              format={quota.format ?? formatNumber}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

/**
 * The project's overview. Its limit summary shows every quota a project
 * can run out of, as Horizon's does; per-instance usage over a date range
 * lives on the Usage trend page, which the trend panel links to, and the
 * risks link opens the dashboard's own Security risks page.
 */
export function OverviewPage() {
  const projectId = useProjectId();
  const limits = useQuery(limitsQuery(projectId));
  const volumeLimits = useQuery(volumeLimitsQuery(projectId));
  const networkQuota = useQuery(networkQuotaQuery(projectId));
  const risks = useQuery(risksQuery(projectId));
  const instances = useQuery(instancesQuery(projectId));

  const byStatus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const instance of instances.data?.items ?? []) {
      counts.set(instance.status, (counts.get(instance.status) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [instances.data]);

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
        <UsageTrendPanel />
        <QuotaPanel
          title="Compute quota"
          query={limits}
          figures={computeQuotas}
        />
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
              <AppLink to="/compute/instances/launch" search={{}} size="xs">
                Launch one
              </AppLink>
              .
            </p>
          ) : (
            <ul className={styles.statusList}>
              {byStatus.map(([status, count]) => (
                <li key={status}>
                  <AppLink to="/compute/instances" search={{ status }}>
                    <span className={styles.statusItem}>
                      <StatusPill
                        tone={statusTone({ status, task_state: null })}
                      >
                        {enumLabel(status)}
                      </StatusPill>
                      <span className={styles.count}>{count}</span>
                    </span>
                  </AppLink>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <QuotaPanel
          title="Volume quota"
          query={volumeLimits}
          figures={volumeQuotas}
        />
        <QuotaPanel
          title="Network quota"
          query={networkQuota}
          figures={networkQuotas}
        />
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
              <AppLink to="/security/risks">Review security risks</AppLink>
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
