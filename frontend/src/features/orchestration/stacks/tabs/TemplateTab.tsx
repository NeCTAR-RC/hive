// The template tab of a stack: the template and environment it runs.
import { useQuery } from "@tanstack/react-query";
import { CodeBlock } from "../../../../components/CodeBlock/CodeBlock";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { stackTemplateQuery } from "../../api";
import styles from "../../Orchestration.module.scss";

/** A stack's template and environment as YAML, loaded when the tab opens. */
export function TemplateTab({ stackId }: { stackId: string }) {
  const projectId = useProjectId();
  const template = useQuery(stackTemplateQuery(projectId, stackId));
  if (template.isPending) return <SkeletonLines lines={8} />;
  if (template.isError)
    return (
      <ErrorState error={template.error} onRetry={() => template.refetch()} />
    );
  return (
    <div className={styles.stack}>
      <CodeBlock text={template.data.template_yaml} label="Template" />
      <CodeBlock text={template.data.environment_yaml} label="Environment" />
    </div>
  );
}
