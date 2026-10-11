// One stack: overview with outputs and parameters, resources, events and
// the template (heat-dashboard stack detail tabs, minus the topology
// graph), plus the change-template dialog.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Alert, Button, TabItem, Tabs } from "@ardc-ui/react";
import { CodeBlock } from "../../components/CodeBlock/CodeBlock";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import type {
  StackDetail,
  StackEvent,
  StackResource,
} from "../../lib/api/types";
import { formatDateTime, formatRelative } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { stackRoute } from "../../app/router";
import {
  stackEventsQuery,
  stackQuery,
  stackResourcesQuery,
  stackTemplateQuery,
  useDeleteStack,
  useStackAction,
} from "./api";
import { UpdateStackDialog } from "./StackDialogs";
import { ACTION_LABELS, statusLabel, statusTone } from "./status";
import styles from "./Orchestration.module.scss";

export function StackDetailPage() {
  const projectId = useProjectId();
  const { stackId } = stackRoute.useParams();
  const search = stackRoute.useSearch();
  const navigate = useNavigate({ from: stackRoute.fullPath });
  const stack = useQuery(stackQuery(projectId, stackId));
  const act = useStackAction(projectId);
  const remove = useDeleteStack(projectId);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const tab = search.tab ?? "overview";
  const selectTab = (key: React.Key) =>
    void navigate({
      search: key === "overview" ? {} : { tab: String(key) },
      replace: true,
    });
  const data = stack.data;

  const run = (action: string) => {
    if (!data) return;
    act.mutate(
      { id: data.id, action },
      {
        onSuccess: () =>
          notify.success(`${ACTION_LABELS[action] ?? action}: ${data.name}.`),
        onError: () => notify.danger(`Could not ${action} stack ${data.name}.`),
      },
    );
  };

  return (
    <>
      <PageHeader
        title={data?.name ?? "Stack"}
        crumbs={[
          { label: "Project" },
          { label: "Orchestration" },
          { label: "Stacks", href: "/orchestration/stacks" },
        ]}
        actions={
          data ? (
            <div className={styles.actions}>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setUpdating(true)}
                isDisabled={!data.actions.includes("update")}
              >
                Change template
              </Button>
              {data.actions.includes("resume") ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => run("resume")}
                >
                  Resume
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => run("suspend")}
                  isDisabled={!data.actions.includes("suspend")}
                >
                  Suspend
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onPress={() => run("check")}
                isDisabled={!data.actions.includes("check")}
              >
                Check
              </Button>
              <Button
                variant="secondary"
                tone="danger"
                size="sm"
                onPress={() => setDeleting(true)}
                isDisabled={!data.actions.includes("delete")}
              >
                Delete
              </Button>
            </div>
          ) : null
        }
      />
      {stack.isError ? (
        <ErrorState error={stack.error} onRetry={() => stack.refetch()} />
      ) : (
        <Tabs
          selectedKey={tab}
          onSelectionChange={selectTab}
          aria-label="Stack details"
        >
          <TabItem id="overview" title="Overview">
            {data ? <Overview stack={data} /> : <SkeletonLines lines={10} />}
          </TabItem>
          <TabItem id="resources" title="Resources">
            <Resources projectId={projectId} stackId={stackId} />
          </TabItem>
          <TabItem id="events" title="Events">
            <Events projectId={projectId} stackId={stackId} />
          </TabItem>
          <TabItem id="template" title="Template">
            <Template projectId={projectId} stackId={stackId} />
          </TabItem>
        </Tabs>
      )}
      {updating && data && (
        <UpdateStackDialog
          projectId={projectId}
          stack={data}
          onClose={() => setUpdating(false)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting}
        onOpenChange={setDeleting}
        title={`Delete stack ${data?.name}?`}
        confirmLabel="Delete"
        confirmText={data?.name ?? ""}
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(stackId, {
            onSuccess: () => {
              notify.success(`Deleting stack ${data?.name}.`);
              void navigate({ to: "/orchestration/stacks" });
            },
          })
        }
      >
        <p>Every resource the stack created is deleted with it.</p>
      </ConfirmDialog>
    </>
  );
}

function Overview({ stack }: { stack: StackDetail }) {
  const parameters = Object.entries(stack.parameters).filter(
    ([key]) => !key.startsWith("OS::"),
  );
  return (
    <div className={styles.grid}>
      {stack.status_reason && stack.status?.endsWith("_FAILED") && (
        <Alert tone="danger" role="status">
          {stack.status_reason}
        </Alert>
      )}
      <Panel title="Status" headingLevel={3}>
        <KeyValueList
          items={[
            {
              label: "Status",
              value: (
                <StatusPill tone={statusTone(stack.status)}>
                  {statusLabel(stack.status)}
                </StatusPill>
              ),
            },
            { label: "Status reason", value: stack.status_reason ?? "-" },
            {
              label: "Created",
              value: formatDateTime(stack.creation_time) || "-",
            },
            {
              label: "Updated",
              value: formatDateTime(stack.updated_time) || "Never",
            },
            { label: "ID", value: <code>{stack.id}</code> },
            {
              label: "Description",
              value: stack.description || stack.template_description || "-",
            },
          ]}
        />
      </Panel>
      <Panel title="Launch parameters" headingLevel={3}>
        <KeyValueList
          items={[
            {
              label: "Timeout",
              value: stack.timeout_mins ? `${stack.timeout_mins} minutes` : "-",
            },
            {
              label: "Rollback on failure",
              value: stack.disable_rollback === false ? "Yes" : "No",
            },
            {
              label: "Tags",
              value: stack.tags.length ? stack.tags.join(", ") : "-",
            },
            { label: "Owner", value: stack.stack_owner ?? "-" },
          ]}
        />
      </Panel>
      <Panel title="Outputs" headingLevel={3}>
        {stack.outputs.length === 0 ? (
          <p className={styles.muted}>None</p>
        ) : (
          <KeyValueList
            items={stack.outputs.map((output) => ({
              label: output.key ?? "",
              value: output.error ? (
                <span>Error: {output.error}</span>
              ) : (
                <span>
                  {output.description && (
                    <span className={styles.muted}>{output.description}. </span>
                  )}
                  <code className={styles.mono}>
                    {typeof output.value === "string"
                      ? output.value
                      : JSON.stringify(output.value)}
                  </code>
                </span>
              ),
            }))}
          />
        )}
      </Panel>
      <Panel title="Stack parameters" headingLevel={3}>
        {parameters.length === 0 ? (
          <p className={styles.muted}>None</p>
        ) : (
          <KeyValueList
            items={parameters.map(([key, value]) => ({
              label: key,
              value: (
                <code className={styles.mono}>
                  {typeof value === "string" ? value : JSON.stringify(value)}
                </code>
              ),
            }))}
          />
        )}
      </Panel>
    </div>
  );
}

function Resources({
  projectId,
  stackId,
}: {
  projectId: string;
  stackId: string;
}) {
  const resources = useQuery(stackResourcesQuery(projectId, stackId));
  const columns = useMemo<ColumnDef<StackResource>[]>(
    () => [
      {
        id: "name",
        label: "Resource",
        isRowHeader: true,
        cell: (row) => row.name ?? row.logical_id ?? "",
        sortValue: (row) => row.name ?? "",
      },
      {
        id: "physical",
        label: "Physical ID",
        cell: (row) => (
          <code className={styles.mono}>{row.physical_id ?? ""}</code>
        ),
        hideBelow: "lg",
      },
      {
        id: "type",
        label: "Type",
        cell: (row) => row.type ?? "",
        sortValue: (row) => row.type ?? "",
        hideBelow: "md",
      },
      {
        id: "updated",
        label: "Updated",
        cell: (row) => formatRelative(row.updated_time) || "",
        sortValue: (row) => row.updated_time ?? "",
        hideBelow: "lg",
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row.status)}>
            {statusLabel(row.status)}
          </StatusPill>
        ),
        sortValue: (row) => row.status ?? "",
      },
      {
        id: "reason",
        label: "Status reason",
        cell: (row) => row.status_reason ?? "",
        hideBelow: "lg",
      },
    ],
    [],
  );
  return (
    <DataTable
      id="stack-resources"
      label="Resources"
      columns={columns}
      rows={resources.data?.items}
      getRowId={(row) => row.name ?? row.logical_id ?? ""}
      isLoading={resources.isPending}
      isFetching={resources.isFetching}
      error={resources.error}
      onRetry={() => void resources.refetch()}
      onRefresh={() => void resources.refetch()}
      emptyTitle="No resources"
    />
  );
}

function Events({
  projectId,
  stackId,
}: {
  projectId: string;
  stackId: string;
}) {
  const events = useQuery(stackEventsQuery(projectId, stackId));
  const columns = useMemo<ColumnDef<StackEvent>[]>(
    () => [
      {
        id: "resource",
        label: "Resource",
        isRowHeader: true,
        cell: (row) => row.resource_name ?? "",
        sortValue: (row) => row.resource_name ?? "",
      },
      {
        id: "time",
        label: "Time",
        cell: (row) => formatDateTime(row.event_time) || "",
        sortValue: (row) => row.event_time ?? "",
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row.status)}>
            {statusLabel(row.status)}
          </StatusPill>
        ),
        sortValue: (row) => row.status ?? "",
      },
      {
        id: "reason",
        label: "Status reason",
        cell: (row) => row.status_reason ?? "",
        hideBelow: "md",
      },
    ],
    [],
  );
  return (
    <DataTable
      id="stack-events"
      label="Events"
      columns={columns}
      rows={events.data?.items}
      getRowId={(row) =>
        row.id ?? `${row.resource_name ?? ""}-${row.event_time ?? ""}`
      }
      isLoading={events.isPending}
      isFetching={events.isFetching}
      error={events.error}
      onRetry={() => void events.refetch()}
      onRefresh={() => void events.refetch()}
      emptyTitle="No events"
      defaultSort={{ column: "time", direction: "descending" }}
    />
  );
}

function Template({
  projectId,
  stackId,
}: {
  projectId: string;
  stackId: string;
}) {
  const template = useQuery(stackTemplateQuery(projectId, stackId));
  if (template.isPending) return <SkeletonLines lines={8} />;
  if (template.isError)
    return (
      <ErrorState error={template.error} onRetry={() => template.refetch()} />
    );
  return (
    <div className={styles.stack}>
      <CodeBlock
        text={template.data.template_yaml}
        label="Template"
        maxHeight="32rem"
      />
      <CodeBlock
        text={template.data.environment_yaml}
        label="Environment"
        maxHeight="16rem"
      />
    </div>
  );
}
