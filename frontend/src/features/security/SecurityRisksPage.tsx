// Security Risks (varroa-dashboard security/index.html): the project's
// detected risks grouped by resource, with the support article and a
// count alert whose tone follows Horizon's thresholds.
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useRouterState } from "@tanstack/react-router";
import { Alert } from "@ardc-ui/react";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { ExternalLink } from "../../components/ExternalLink/ExternalLink";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { formatDateTime } from "../../lib/format";
import { risksQuery } from "../../lib/queries";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { groupRisks, riskName, riskTone, SECURITY_HELP } from "./risks";
import styles from "./SecurityRisksPage.module.scss";

export function SecurityRisksPage() {
  const projectId = useProjectId();
  const risks = useQuery(risksQuery(projectId));
  const hash = useRouterState({ select: (s) => s.location.hash });
  const groups = useMemo(
    () => groupRisks(risks.data?.items ?? []),
    [risks.data],
  );
  const count = risks.data?.items.length ?? 0;

  // A `#<resource id>` link from an instance row scrolls to its panel.
  useEffect(() => {
    if (!hash || !risks.data) return;
    document.getElementById(`risk-${hash}`)?.scrollIntoView({ block: "start" });
  }, [hash, risks.data]);

  return (
    <>
      <PageHeader title="Security Risks" crumbs={[{ label: "Project" }]}>
        <p className={styles.intro}>
          The Nectar Cloud infrastructure is regularly scanned for
          vulnerabilities. Users must ensure all detected security risks are
          actioned. For more about security risks and how to resolve them, read
          the{" "}
          <ExternalLink href={SECURITY_HELP}>
            Nectar Support article on security risks
          </ExternalLink>
          .
        </p>
      </PageHeader>
      <div className={styles.stack}>
        {risks.isPending ? (
          <SkeletonLines lines={4} />
        ) : risks.isError ? (
          <ErrorState error={risks.error} onRetry={() => risks.refetch()} />
        ) : !risks.data.available ? (
          <Alert tone="info" role="status">
            Security scanning is not available on this cloud.
          </Alert>
        ) : (
          <>
            <Alert tone={riskTone(count)} role="status">
              {count === 0 ? (
                <>
                  Your project has <strong>0</strong> security risks detected.
                </>
              ) : (
                <>
                  Your project currently has <strong>{count}</strong>{" "}
                  {count === 1 ? "security risk" : "security risks"} requiring
                  action.
                </>
              )}
            </Alert>
            {groups.length > 0 && (
              <section aria-labelledby="risks-heading" className={styles.stack}>
                <h2 id="risks-heading" className={styles.heading}>
                  Risks detected
                </h2>
                {groups.map((group) => (
                  <div
                    key={group.resourceId}
                    id={`risk-${group.resourceId}`}
                    className={
                      hash === group.resourceId ? styles.highlight : undefined
                    }
                  >
                    <Panel
                      title={`${group.resourceType} ${group.resourceId}`}
                      headingLevel={3}
                      actions={
                        group.resourceType === "instance" ? (
                          <RouterLink
                            to="/compute/instances/$instanceId"
                            params={{ instanceId: group.resourceId }}
                          >
                            View instance
                          </RouterLink>
                        ) : null
                      }
                    >
                      <p className={styles.muted}>
                        Please review the following{" "}
                        {group.risks.length === 1 ? "risk" : "risks"} for this{" "}
                        {group.resourceType}.
                      </p>
                      <ul className={styles.risks}>
                        {group.risks.map((risk) => (
                          <li key={risk.id} className={styles.risk}>
                            <p className={styles.riskName}>{riskName(risk)}</p>
                            {risk.type?.description && (
                              <p>{risk.type.description}</p>
                            )}
                            <p className={styles.muted}>
                              {risk.ipaddress && (
                                <>
                                  Address: <code>{risk.ipaddress}</code>
                                  {risk.port ? `:${risk.port}` : ""}
                                  {" | "}
                                </>
                              )}
                              Last detected: {formatDateTime(risk.last_seen)}
                              {risk.type?.help_url && (
                                <>
                                  {" | "}
                                  <ExternalLink href={risk.type.help_url}>
                                    Learn more
                                  </ExternalLink>
                                </>
                              )}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </Panel>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
