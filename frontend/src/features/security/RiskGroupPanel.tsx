// One resource's panel on the Security Risks page.
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@ardc-ui/react";
import { AppLink } from "../../components/AppLink/AppLink";
import { Panel } from "../../components/Panel/Panel";
import { formatDateTime } from "../../lib/format";
import { useProjectId } from "../../lib/hooks/useProjectId";
import { instanceQuery } from "../compute/api";
import { exposesPort, resourceTitle, riskName, type RiskGroup } from "./risks";
import styles from "./SecurityRisksPage.module.scss";

/**
 * The risks of one resource, headed by its name ("Instance db-1") with its
 * id under it. An instance's name comes from its record (the id stands in
 * until then, or when the instance is gone); a risk on a port points to
 * the instance's security groups, where it is fixed.
 */
export function RiskGroupPanel({ group }: { group: RiskGroup }) {
  const projectId = useProjectId();
  const isInstance = group.resourceType === "instance";
  const instance = useQuery({
    ...instanceQuery(projectId, group.resourceId),
    enabled: isInstance,
  });
  const name = instance.data?.name;
  const label = name || group.resourceId;
  return (
    <Panel
      title={resourceTitle(group, name)}
      headingLevel={3}
      actions={
        isInstance ? (
          <AppLink
            to="/compute/instances/$instanceId"
            params={{ instanceId: group.resourceId }}
          >
            View instance
          </AppLink>
        ) : null
      }
    >
      <div className={styles.panelStack}>
        <p className={styles.muted}>
          ID <code>{group.resourceId}</code>. Please review the following{" "}
          {group.risks.length === 1 ? "risk" : "risks"} for this{" "}
          {group.resourceType}.
        </p>
        <ul className={styles.risks}>
          {group.risks.map((risk) => (
            <li key={risk.id}>
              <Alert tone="danger">
                <div className={styles.risk}>
                  <p>
                    <strong>{riskName(risk)}</strong>
                  </p>
                  {risk.type?.description && <p>{risk.type.description}</p>}
                  <p>
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
                        <AppLink href={risk.type.help_url} newTab size="xs">
                          Learn more
                        </AppLink>
                      </>
                    )}
                  </p>
                  {isInstance && exposesPort(risk) && (
                    <p>
                      <AppLink
                        to="/compute/instances/$instanceId"
                        params={{ instanceId: group.resourceId }}
                        search={{ tab: "security" }}
                        size="xs"
                      >
                        Check the security groups of {label}
                      </AppLink>{" "}
                      to close the port to the Internet.
                    </p>
                  )}
                </div>
              </Alert>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
