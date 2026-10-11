// The Logs and Defaults tabs of a database instance (trove-dashboard
// LogsTab with logs/tables.py and logs/views.py, and ConfigDefaultsTab).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  Label,
  Modal,
  Select,
  SelectItem,
  type Key,
} from "@ardc-ui/react";
import { CodeBlock } from "../../components/CodeBlock/CodeBlock";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { filterRows } from "../../components/DataTable/filter";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import type { DbConfigDefault, DbLog } from "../../lib/api/types";
import { downloadUrl } from "../../lib/download";
import { formatBytes } from "../../lib/format";
import { notify } from "../../lib/notify";
import {
  dbConfigDefaultsQuery,
  dbLogContentsQuery,
  dbLogsQuery,
  logDownloadUrl,
  useLogAction,
  type LogAction,
} from "./api";
import { statusLabel, statusTone } from "./status";
import styles from "./Databases.module.scss";

const PAST_TENSE: Record<LogAction, string> = {
  enable: "Enabled",
  disable: "Disabled",
  publish: "Published",
  discard: "Discarded",
};

export function LogsTab({
  projectId,
  instanceId,
  openLog,
  onOpenLog,
}: {
  projectId: string;
  instanceId: string;
  openLog: string | undefined;
  onOpenLog: (name: string | null) => void;
}) {
  const logs = useQuery(dbLogsQuery(projectId, instanceId));
  const act = useLogAction(projectId);
  const columns = useMemo<ColumnDef<DbLog>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => row.name ?? "",
        sortValue: (row) => row.name ?? "",
      },
      {
        id: "type",
        label: "Type",
        cell: (row) => row.type ?? "",
        sortValue: (row) => row.type ?? "",
        hideBelow: "md",
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row.status_kind)}>
            {statusLabel(row.status)}
          </StatusPill>
        ),
        sortValue: (row) => row.status ?? "",
      },
      {
        id: "published",
        label: "Published",
        cell: (row) => formatBytes(row.published),
        sortValue: (row) => row.published,
        hideBelow: "md",
      },
      {
        id: "pending",
        label: "Publishable",
        cell: (row) => formatBytes(row.pending),
        sortValue: (row) => row.pending,
        hideBelow: "lg",
      },
      {
        id: "container",
        label: "Container",
        cell: (row) => row.container ?? "-",
        hideBelow: "lg",
      },
    ],
    [],
  );
  const run = (row: DbLog, action: LogAction) =>
    act.mutate(
      { instanceId, name: row.name ?? "", action },
      {
        onSuccess: () =>
          notify.success(`${PAST_TENSE[action]} log ${row.name}.`),
        onError: () => notify.danger(`Could not ${action} log ${row.name}.`),
      },
    );
  return (
    <>
      <DataTable
        id="db-logs"
        label="Logs"
        columns={columns}
        rows={logs.data?.items}
        getRowId={(row) => row.name ?? ""}
        isLoading={logs.isPending}
        isFetching={logs.isFetching}
        error={logs.error}
        onRetry={() => void logs.refetch()}
        onRefresh={() => void logs.refetch()}
        emptyTitle="This datastore offers no guest logs"
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "view",
            label: "View log",
            isDisabled: !row.actions.includes("view"),
            disabledReason: "Publish the log first.",
            onAction: () => onOpenLog(row.name ?? ""),
          },
          {
            id: "publish",
            label: "Publish log",
            onAction: () => run(row, "publish"),
          },
          {
            id: "enable",
            label: "Enable log",
            onAction: () => run(row, "enable"),
          },
          {
            id: "disable",
            label: "Disable log",
            isDisabled: !row.actions.includes("disable"),
            disabledReason: "System logs cannot be disabled.",
            onAction: () => run(row, "disable"),
          },
          {
            id: "discard",
            label: "Discard log",
            tone: "danger",
            onAction: () => run(row, "discard"),
          },
        ]}
      />
      {openLog && (
        <LogContentsDialog
          projectId={projectId}
          instanceId={instanceId}
          name={openLog}
          onClose={() => onOpenLog(null)}
        />
      )}
    </>
  );
}

const LINE_CHOICES = [
  { id: "50", label: "Last 50 lines", lines: 50 },
  { id: "200", label: "Last 200 lines", lines: 200 },
  { id: "1000", label: "Last 1000 lines", lines: 1000 },
  { id: "0", label: "Whole log", lines: 0 },
];

export function LogContentsDialog({
  projectId,
  instanceId,
  name,
  onClose,
}: {
  projectId: string;
  instanceId: string;
  name: string;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState("50");
  const lines = LINE_CHOICES.find((c) => c.id === choice)?.lines ?? 50;
  const contents = useQuery(
    dbLogContentsQuery(projectId, instanceId, name, lines),
  );
  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      isDismissable
    >
      <Dialog title={`Log ${name}`} closeLabel="Close">
        <div className={styles.stack}>
          <div className={styles.actions}>
            <Select
              aria-label="Lines"
              labelPosition="side"
              selectedKey={choice}
              onSelectionChange={(key: Key | null) =>
                setChoice(key === null ? "50" : String(key))
              }
            >
              <Label>Lines</Label>
              {LINE_CHOICES.map((option) => (
                <SelectItem
                  key={option.id}
                  id={option.id}
                  textValue={option.label}
                >
                  {option.label}
                </SelectItem>
              ))}
            </Select>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => void contents.refetch()}
            >
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onPress={() =>
                downloadUrl(
                  logDownloadUrl(instanceId, name),
                  `${instanceId}-${name}.log`,
                )
              }
            >
              Download
            </Button>
          </div>
          {contents.isPending ? (
            <SkeletonLines lines={8} />
          ) : contents.isError ? (
            <ErrorState
              error={contents.error}
              onRetry={() => contents.refetch()}
            />
          ) : (
            <>
              {contents.data.partial && (
                <p className={styles.muted}>
                  Showing the last {lines} lines of{" "}
                  {formatBytes(contents.data.published)} published. Choose
                  &quot;Whole log&quot; or download the file for everything.
                </p>
              )}
              {contents.data.truncated && (
                <p className={styles.muted}>
                  The viewer stops at 4 MB. Download the log for the rest.
                </p>
              )}
              <CodeBlock
                text={contents.data.text || "(empty)"}
                label={`${name} log`}
                maxHeight="60vh"
              />
            </>
          )}
        </div>
      </Dialog>
    </Modal>
  );
}

export function DefaultsTab({
  projectId,
  instanceId,
}: {
  projectId: string;
  instanceId: string;
}) {
  const defaults = useQuery(dbConfigDefaultsQuery(projectId, instanceId));
  const [query, setQuery] = useState("");
  const columns = useMemo<ColumnDef<DbConfigDefault>[]>(
    () => [
      {
        id: "name",
        label: "Parameter",
        isRowHeader: true,
        cell: (row) => row.name,
        sortValue: (row) => row.name,
        textValue: (row) => `${row.name} ${String(row.value ?? "")}`,
      },
      {
        id: "value",
        label: "Value",
        cell: (row) => <code>{String(row.value ?? "")}</code>,
      },
    ],
    [],
  );
  const rows = useMemo(
    () => filterRows(defaults.data?.items ?? [], query, columns),
    [defaults.data, query, columns],
  );
  return (
    <DataTable
      id="db-config-defaults"
      label="Configuration defaults"
      columns={columns}
      rows={rows}
      getRowId={(row) => row.name}
      isLoading={defaults.isPending}
      isFetching={defaults.isFetching}
      error={defaults.error}
      onRetry={() => void defaults.refetch()}
      onRefresh={() => void defaults.refetch()}
      search={{
        value: query,
        onChange: setQuery,
        placeholder: "Search parameters",
      }}
      resetKey={query}
      emptyTitle="No configuration values"
      defaultSort={{ column: "name", direction: "ascending" }}
    />
  );
}
