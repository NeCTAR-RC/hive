import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { ApiError } from "../../../lib/api/client";
import type { SecurityGroupRule } from "../../../lib/api/types";
import { formatDateTime } from "../../../lib/format";
import { notify } from "../../../lib/notify";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { securityGroupRoute } from "../../../app/router";
import {
  securityGroupQuery,
  securityGroupsQuery,
  useDeleteRule,
  useDeleteSecurityGroups,
} from "../api";
import { AddRuleDialog, EditSecurityGroupDialog } from "./SecurityGroupDialogs";
import { portRange } from "./rules";
import styles from "./SecurityGroupDetailPage.module.scss";

const CRUMBS = [
  { label: "Project" },
  { label: "Network" },
  { label: "Security Groups", href: "/network/security-groups" },
];

export function SecurityGroupDetailPage() {
  const projectId = useProjectId();
  const { groupId } = securityGroupRoute.useParams();
  const navigate = useNavigate();
  const group = useQuery(securityGroupQuery(projectId, groupId));
  const groups = useQuery(securityGroupsQuery(projectId));
  const removeRule = useDeleteRule(projectId);
  const removeGroup = useDeleteSecurityGroups(projectId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [deletingRule, setDeletingRule] = useState<SecurityGroupRule | null>(
    null,
  );

  const groupNames = useMemo(
    () => new Map((groups.data?.items ?? []).map((g) => [g.id, g.name])),
    [groups.data],
  );

  const columns = useMemo<ColumnDef<SecurityGroupRule>[]>(
    () => [
      {
        id: "direction",
        label: "Direction",
        isRowHeader: true,
        cell: (row) => (row.direction === "ingress" ? "Ingress" : "Egress"),
        sortValue: (row) => row.direction,
      },
      {
        id: "ethertype",
        label: "Ether type",
        cell: (row) => row.ethertype,
        sortValue: (row) => row.ethertype,
        hideBelow: "md",
      },
      {
        id: "protocol",
        label: "Protocol",
        cell: (row) => (row.protocol ?? "Any").toUpperCase(),
        sortValue: (row) => row.protocol ?? "",
      },
      {
        id: "ports",
        label: "Port range",
        cell: (row) => portRange(row),
        sortValue: (row) => row.port_range_min ?? -1,
      },
      {
        id: "remote",
        label: "Remote",
        cell: (row) =>
          row.remote_group_id ? (
            <span>
              {groupNames.get(row.remote_group_id) ?? row.remote_group_id}
            </span>
          ) : (
            <span className={styles.remote}>
              <code>{row.remote_ip_prefix ?? "Any"}</code>
              {row.open_to_the_world && (
                <StatusPill tone="warning">Open to the internet</StatusPill>
              )}
            </span>
          ),
        sortValue: (row) => row.remote_ip_prefix ?? row.remote_group_id ?? "",
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => row.description,
        hideBelow: "lg",
      },
    ],
    [groupNames],
  );

  if (group.isError) {
    const notFound =
      group.error instanceof ApiError && group.error.status === 404;
    return (
      <>
        <PageHeader
          title={notFound ? "Security group not found" : "Security group"}
          crumbs={CRUMBS}
        />
        {notFound ? (
          <p>
            There is no security group with id <code>{groupId}</code> in this
            project.{" "}
            <RouterLink to="/network/security-groups">
              Back to security groups
            </RouterLink>
          </p>
        ) : (
          <ErrorState
            error={group.error}
            onRetry={() => void group.refetch()}
          />
        )}
      </>
    );
  }

  const data = group.data;
  const isDefault = data?.name === "default";
  return (
    <>
      <PageHeader
        title={data?.name ?? "Security group"}
        crumbs={CRUMBS}
        actions={
          data && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setEditing(true)}
              >
                Edit
              </Button>
              <Button
                variant="secondary"
                size="sm"
                tone="danger"
                isDisabled={isDefault}
                onPress={() => setDeletingGroup(true)}
              >
                Delete
              </Button>
            </>
          )
        }
      />
      <div className={styles.stack}>
        <Panel title="Security group">
          {!data ? (
            <SkeletonLines lines={4} />
          ) : (
            <KeyValueList
              items={[
                { label: "Name", value: data.name },
                { label: "ID", value: <code>{data.id}</code> },
                { label: "Description", value: data.description },
                { label: "Created", value: formatDateTime(data.created_at) },
              ]}
            />
          )}
        </Panel>
        <section aria-labelledby="rules-heading">
          <h2 id="rules-heading" className={styles.rulesHeading}>
            Rules
          </h2>
          <DataTable
            id="security-group-rules"
            label="Rules"
            columns={columns}
            rows={data?.rules}
            getRowId={(row) => row.id}
            isLoading={group.isPending}
            isFetching={group.isFetching}
            onRefresh={() => void group.refetch()}
            emptyTitle="No rules"
            emptyBody={
              <p>
                Without ingress rules nothing can reach instances in this group.
              </p>
            }
            defaultSort={{ column: "direction", direction: "ascending" }}
            toolbarActions={
              <Button
                size="xs"
                onPress={() => setAdding(true)}
                isDisabled={!data}
              >
                Add rule
              </Button>
            }
            rowActions={(row) => [
              {
                id: "delete",
                label: "Delete rule",
                tone: "danger",
                onAction: () => setDeletingRule(row),
              },
            ]}
          />
        </section>
      </div>
      {adding && data && (
        <AddRuleDialog
          projectId={projectId}
          group={data}
          onClose={() => setAdding(false)}
        />
      )}
      {editing && data && (
        <EditSecurityGroupDialog
          projectId={projectId}
          group={data}
          onClose={() => setEditing(false)}
        />
      )}
      <ConfirmDialog
        isOpen={deletingRule !== null}
        onOpenChange={(open) => !open && setDeletingRule(null)}
        title="Delete rule?"
        confirmLabel="Delete"
        isPending={removeRule.isPending}
        error={removeRule.error}
        onConfirm={() => {
          if (!deletingRule) return;
          removeRule.mutate(
            { groupId, ruleId: deletingRule.id },
            {
              onSuccess: () => {
                notify.success("Rule deleted.");
                setDeletingRule(null);
              },
            },
          );
        }}
      >
        {deletingRule && (
          <p>
            {deletingRule.direction}{" "}
            {(deletingRule.protocol ?? "any").toUpperCase()}{" "}
            {portRange(deletingRule)} from{" "}
            {deletingRule.remote_ip_prefix ??
              groupNames.get(deletingRule.remote_group_id ?? "") ??
              "any"}
          </p>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        isOpen={deletingGroup}
        onOpenChange={setDeletingGroup}
        title={`Delete security group ${data?.name ?? ""}?`}
        confirmLabel="Delete"
        isPending={removeGroup.isPending}
        error={removeGroup.error}
        onConfirm={() => {
          removeGroup.mutate([groupId], {
            onSuccess: () => {
              notify.success(`Security group ${data?.name} deleted.`);
              void navigate({ to: "/network/security-groups" });
            },
          });
        }}
      >
        <p>A group still applied to an instance cannot be deleted.</p>
      </ConfirmDialog>
    </>
  );
}
