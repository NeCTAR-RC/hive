// The home page's notices: current outages and the project's security risks.
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@ardc-ui/react";
import { AppLink } from "../../components/AppLink/AppLink";
import { outagesQuery, risksQuery } from "../../lib/queries";
import { useProjectId } from "../../lib/hooks/useProjectId";
import styles from "./HomePage.module.scss";
import { outageAlerts } from "./outages";

/**
 * The page's notices in one stack: the outages under way or coming (severity
 * 2 and up), then the project's security risks once the project is known.
 * Nothing renders while there is nothing to say, so the page keeps no empty
 * slot between its sections.
 */
export function Alerts() {
  const projectId = useProjectId();
  const outages = useQuery(outagesQuery);
  const risks = useQuery({
    ...risksQuery(projectId),
    enabled: projectId !== "",
  });
  const alerts = outageAlerts(outages.data?.items ?? []);
  const riskCount = risks.data?.items.length ?? 0;
  if (alerts.length === 0 && riskCount === 0) return null;
  return (
    <div className={styles.alerts}>
      {alerts.map(({ outage, tone }) => (
        <Alert key={outage.id} tone={tone} role="status">
          <strong>{outage.scheduled ? "Scheduled outage" : "Outage"}:</strong>{" "}
          {outage.title}
          {outage.status_display ? ` (${outage.status_display})` : ""}.{" "}
          <AppLink href={outage.url} newTab size="xs">
            Details
          </AppLink>
        </Alert>
      ))}
      {riskCount > 0 && (
        <Alert tone="danger" role="status">
          <strong>Security risks detected:</strong> {riskCount}{" "}
          {riskCount === 1 ? "resource needs" : "resources need"} attention.{" "}
          <AppLink to="/security/risks" size="xs">
            Review security risks
          </AppLink>
        </Alert>
      )}
    </div>
  );
}
