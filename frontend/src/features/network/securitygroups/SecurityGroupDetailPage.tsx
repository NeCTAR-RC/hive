// A security group's detail page: its fields, and its rules with add and
// delete.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { DataTable } from "../../../components/DataTable/DataTable";
import { RowActionsMenu } from "../../../components/DataTable/RowActionsMenu";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { toRowActions } from "../../../lib/actions";
import type { SecurityGroupRule } from "../../../lib/api/types/network";
import { formatDateTime } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import {
  deleteSecurityGroupRule,
  securityGroupQuery,
  securityGroupWriteKeys,
  securityGroupsQuery,
} from "../api";
import { availableSecurityGroupActions } from "../status";
import { useSecurityGroupActions } from "./SecurityGroupActions";
import { AddRuleDialog } from "./dialogs/AddRuleDialog";
import { describeRule } from "./rules";
import { useRuleColumns } from "./useRuleColumns";
import styles from "./SecurityGroupDetailPage.module.scss";

const securityGroupRoute = getRouteApi("/app/network/security-groups/$groupId");

const CRUMBS = [
  { label: "Project" },
  { label: "Network" },
  { label: "Security groups", href: "/network/security-groups" },
];

/** One security group with its actions in the header and its rules. */
export function SecurityGroupDetailPage() {
  const projectId = useProjectId();
  const { groupId } = securityGroupRoute.useParams();
  const navigate = useNavigate();
  const group = useQuery(securityGroupQuery(projectId, groupId));
  const groups = useQuery(securityGroupsQuery(projectId));
  const actions = useSecurityGroupActions(
    () => void navigate({ to: "/network/security-groups" }),
  );
  const [addingRule, setAddingRule] = useState(false);

  const groupNames = useMemo(
    () => new Map((groups.data?.items ?? []).map((g) => [g.id, g.name])),
    [groups.data],
  );
  const describe = (rule: SecurityGroupRule) => describeRule(rule, groupNames);
  const rules = useBulkAction<SecurityGroupRule, "delete">({
    noun: { one: "rule", many: "rules" },
    name: describe,
    getId: (rule) => rule.id,
    invalidates: securityGroupWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (rule) => deleteSecurityGroupRule(groupId, rule.id),
        title: (targets) =>
          targets.length === 1
            ? "Delete rule?"
            : `Delete ${targets.length} rules?`,
        body: (targets) =>
          targets.map((rule) => <p key={rule.id}>{describe(rule)}</p>),
      },
    },
  });

  const columns = useRuleColumns(groupNames);

  return (
    <>
      <DetailPage
        query={group}
        noun="security group"
        id={groupId}
        crumbs={CRUMBS}
        backTo={{ label: "security groups", href: "/network/security-groups" }}
        title={(data) => data.name}
        actions={(data) => (
          <RowActionsMenu
            actions={toRowActions(availableSecurityGroupActions(data), (id) =>
              actions.run(id, [data]),
            )}
          />
        )}
      >
        {(data) => (
          <div className={styles.stack}>
            <Panel title="Security group">
              <KeyValueList
                items={[
                  { label: "Name", value: data.name },
                  { label: "ID", value: <code>{data.id}</code> },
                  { label: "Description", value: data.description },
                  { label: "Created", value: formatDateTime(data.created_at) },
                ]}
              />
            </Panel>
            <Panel title="Rules">
              <DataTable
                id="security-group-rules"
                label="Rules"
                columns={columns}
                rows={data.rules}
                getRowId={(row) => row.id}
                {...rules.tableProps}
                isFetching={group.isFetching}
                onRefresh={() => void group.refetch()}
                emptyTitle="No rules"
                emptyBody={
                  <p>
                    Without ingress rules nothing can reach instances in this
                    group.
                  </p>
                }
                defaultSort={{ column: "direction", direction: "ascending" }}
                toolbarActions={
                  <Button size="xs" onPress={() => setAddingRule(true)}>
                    Add rule
                  </Button>
                }
                rowActions={(row) => [
                  {
                    id: "delete",
                    label: "Delete rule",
                    tone: "danger",
                    onAction: () => rules.run("delete", [row]),
                  },
                ]}
              />
            </Panel>
          </div>
        )}
      </DetailPage>
      {addingRule && group.data && (
        <AddRuleDialog
          group={group.data}
          onClose={() => setAddingRule(false)}
        />
      )}
      {actions.dialogs}
      {rules.dialog}
    </>
  );
}
