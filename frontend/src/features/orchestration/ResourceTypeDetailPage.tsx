// One resource type: its properties and attributes schema and a template
// snippet (heat-dashboard resource type detail).
import { useQuery } from "@tanstack/react-query";
import { CodeBlock } from "../../components/CodeBlock/CodeBlock";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { resourceTypeRoute } from "../../app/router";
import { resourceTypeQuery } from "./api";
import styles from "./Orchestration.module.scss";

export function ResourceTypeDetailPage() {
  const projectId = useProjectId();
  const { name } = resourceTypeRoute.useParams();
  const type = useQuery(resourceTypeQuery(projectId, name));
  const data = type.data;
  return (
    <>
      <PageHeader
        title={name || "Resource type"}
        crumbs={[
          { label: "Project" },
          { label: "Orchestration" },
          { label: "Resource Types", href: "/orchestration/resource-types" },
        ]}
      />
      {type.isPending ? (
        <SkeletonLines lines={10} />
      ) : type.isError ? (
        <ErrorState error={type.error} onRetry={() => type.refetch()} />
      ) : data ? (
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
          <CodeBlock
            text={data.template_yaml}
            label="Template snippet"
            maxHeight="24rem"
          />
        </div>
      ) : null}
    </>
  );
}
