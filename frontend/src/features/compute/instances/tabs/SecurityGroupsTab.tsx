// The instance detail page's security groups tab.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../../components/AppLink/AppLink";
import { DataTable } from "../../../../components/DataTable/DataTable";
import { Panel } from "../../../../components/Panel/Panel";
import type { InstanceDetail } from "../../../../lib/api/types/compute";
import type {
  SecurityGroup,
  SecurityGroupRule,
} from "../../../../lib/api/types/network";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { securityGroupQuery, securityGroupsQuery } from "../../../network/api";
import { useRuleColumns } from "../../../network/securitygroups/useRuleColumns";
import { RelatedList, RelatedRow } from "../../RelatedList";
import styles from "../InstanceDetailPage.module.scss";

/**
 * The security groups applied to the instance, each linked to its page
 * when the project's list holds it, with an edit button that opens the
 * instance's security groups dialog (`onEdit`), and then each group's
 * rules, as Horizon's instance overview lists them, so "can I reach port
 * 22" is answered here.
 */
export function SecurityGroupsTab({
  instance,
  onEdit,
}: {
  instance: InstanceDetail;
  onEdit: () => void;
}) {
  const projectId = useProjectId();
  const groups = useQuery(securityGroupsQuery(projectId));
  const byName = new Map((groups.data?.items ?? []).map((g) => [g.name, g]));
  const groupNames = useMemo(
    () => new Map((groups.data?.items ?? []).map((g) => [g.id, g.name])),
    [groups.data],
  );
  const applied = instance.security_groups.flatMap((name) => {
    const group = byName.get(name);
    return group ? [group] : [];
  });
  return (
    <div className={styles.stack}>
      <Panel
        title="Security groups"
        actions={
          <Button variant="secondary" size="xs" onPress={onEdit}>
            Edit security groups
          </Button>
        }
      >
        {instance.security_groups.length === 0 ? (
          <p className={styles.muted}>No security groups are applied.</p>
        ) : (
          <RelatedList>
            {instance.security_groups.map((name) => {
              const group = byName.get(name);
              return (
                <RelatedRow key={name} meta={group?.description}>
                  {group ? (
                    <AppLink
                      to="/network/security-groups/$groupId"
                      params={{ groupId: group.id }}
                    >
                      {name}
                    </AppLink>
                  ) : (
                    name
                  )}
                </RelatedRow>
              );
            })}
          </RelatedList>
        )}
      </Panel>
      {applied.map((group) => (
        <GroupRules key={group.id} group={group} groupNames={groupNames} />
      ))}
    </div>
  );
}

const ruleId = (rule: SecurityGroupRule) => rule.id;

/** One applied group's rules, read only; the group's page edits them. */
function GroupRules({
  group,
  groupNames,
}: {
  group: SecurityGroup;
  groupNames: ReadonlyMap<string, string>;
}) {
  const projectId = useProjectId();
  const detail = useQuery(securityGroupQuery(projectId, group.id));
  const columns = useRuleColumns(groupNames);
  return (
    <Panel title={`Rules of ${group.name}`}>
      <DataTable
        id="instance-security-group-rules"
        label={`Rules of ${group.name}`}
        columns={columns}
        rows={detail.data?.rules}
        getRowId={ruleId}
        isLoading={detail.isPending}
        isFetching={detail.isFetching}
        error={detail.error}
        onRetry={() => void detail.refetch()}
        emptyTitle="No rules"
        emptyBody={
          <p>
            Without ingress rules this group lets nothing reach the instance.
          </p>
        }
      />
    </Panel>
  );
}
