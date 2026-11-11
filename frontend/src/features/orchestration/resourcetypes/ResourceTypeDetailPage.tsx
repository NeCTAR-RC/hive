// One resource type: its properties and attributes schema and a template
// snippet (heat-dashboard resource type detail).
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { CodeBlock } from "../../../components/CodeBlock/CodeBlock";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { resourceTypeQuery } from "../api";
import styles from "../Orchestration.module.scss";

const resourceTypeRoute = getRouteApi(
  "/app/orchestration/resource-types/$name",
);

export function ResourceTypeDetailPage() {
  const projectId = useProjectId();
  const { name } = resourceTypeRoute.useParams();
  const type = useQuery(resourceTypeQuery(projectId, name));
  return (
    <DetailPage
      query={type}
      noun="resource type"
      id={name}
      idIsName
      crumbs={[
        { label: "Project" },
        { label: "Orchestration" },
        { label: "Resource types", href: "/orchestration/resource-types" },
      ]}
      backTo={{
        label: "resource types",
        href: "/orchestration/resource-types",
      }}
      title={() => name}
    >
      {(data) => (
        <div className={styles.stack}>
          {data.support_status && (
            <p className={styles.muted}>
              Support status:{" "}
              {String(
                (data.support_status as { status?: string }).status ??
                  "unknown",
              )}
              {(data.support_status as { message?: string }).message
                ? `. ${(data.support_status as { message?: string }).message}`
                : ""}
            </p>
          )}
          <div className={styles.grid}>
            <Panel title="Properties" headingLevel={2}>
              {Object.keys(data.properties).length === 0 ? (
                <p className={styles.muted}>None</p>
              ) : (
                <KeyValueList
                  items={Object.entries(data.properties)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, value]) => ({
                      label: key,
                      value: (
                        <span>
                          {String(value.type ?? "")}
                          {value.required ? ", required" : ""}
                          {value.description
                            ? `. ${String(value.description)}`
                            : ""}
                        </span>
                      ),
                    }))}
                />
              )}
            </Panel>
            <Panel title="Attributes" headingLevel={2}>
              {Object.keys(data.attributes).length === 0 ? (
                <p className={styles.muted}>None</p>
              ) : (
                <KeyValueList
                  items={Object.entries(data.attributes)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, value]) => ({
                      label: key,
                      value: value.description ?? "",
                    }))}
                />
              )}
            </Panel>
          </div>
          <CodeBlock text={data.template_yaml} label="Template snippet" />
        </div>
      )}
    </DetailPage>
  );
}
