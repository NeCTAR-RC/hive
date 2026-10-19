import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Alert,
  Button,
  Label,
  Select,
  SelectItem,
  TabItem,
  Tabs,
} from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import { CodeBlock } from "../../../components/CodeBlock/CodeBlock";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  RowActionsMenu,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { ApiError } from "../../../lib/api/client";
import type {
  InstanceAction,
  InstanceDetail,
  InstancePort,
  InstanceVolume,
} from "../../../lib/api/types";
import {
  formatDateTime,
  formatGb,
  formatMb,
  formatSuRate,
} from "../../../lib/format";
import { notify } from "../../../lib/notify";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { instanceRoute } from "../../../app/router";
import { networksQuery, securityGroupsQuery } from "../../network/api";
import { useDetachVolume } from "../../volumes/api";
import { AttachVolumeDialog } from "./InstanceVolumeDialogs";
import {
  consoleOutputQuery,
  instanceActionLogQuery,
  instancePortsQuery,
  instanceQuery,
  instanceVolumesQuery,
  useInstanceAction,
} from "../api";
import { useInstanceActions } from "./InstanceActions";
import {
  availableActions,
  powerStateLabel,
  statusLabel,
  statusTone,
} from "./status";
import styles from "./InstanceDetailPage.module.scss";
import { RouteLink } from "../../../components/RouteLink/RouteLink";

const TABS = [
  "overview",
  "interfaces",
  "volumes",
  "security",
  "log",
  "actions",
] as const;
type Tab = (typeof TABS)[number];

const CRUMBS = [
  { label: "Project" },
  { label: "Compute" },
  { label: "Instances", href: "/compute/instances" },
];

export function InstanceDetailPage() {
  const projectId = useProjectId();
  const { instanceId } = instanceRoute.useParams();
  const search = instanceRoute.useSearch();
  const navigate = useNavigate({ from: instanceRoute.fullPath });
  const instance = useQuery(instanceQuery(projectId, instanceId));
  const { run, dialogs } = useInstanceActions(projectId);
  const tab: Tab = TABS.includes(search.tab as Tab)
    ? (search.tab as Tab)
    : "overview";

  // Horizon's /resize/ page maps to ?action=resize: open the dialog once.
  const openedAction = useRef(false);
  useEffect(() => {
    if (search.action === "resize" && instance.data && !openedAction.current) {
      openedAction.current = true;
      run([instance.data], "resize");
      void navigate({ search: { tab: search.tab }, replace: true });
    }
  }, [search.action, search.tab, instance.data, run, navigate]);

  const selectTab = (key: Key) =>
    void navigate({ search: { tab: String(key) }, replace: true });

  if (instance.isError) {
    const notFound =
      instance.error instanceof ApiError && instance.error.status === 404;
    return (
      <>
        <PageHeader
          title={notFound ? "Instance not found" : "Instance"}
          crumbs={CRUMBS}
        />
        {notFound ? (
          <p>
            There is no instance with id <code>{instanceId}</code> in this
            project.{" "}
            <RouteLink to="/compute/instances">Back to instances</RouteLink>
          </p>
        ) : (
          <ErrorState
            error={instance.error}
            onRetry={() => void instance.refetch()}
          />
        )}
      </>
    );
  }

  const data = instance.data;
  return (
    <>
      <PageHeader
        title={data?.name ?? "Instance"}
        crumbs={CRUMBS}
        actions={
          data && (
            <RowActionsMenu
              actions={availableActions(data).map((action) => ({
                id: action.id,
                label: action.label,
                onAction: () => run([data], action.id),
                isDisabled: action.isDisabled,
                ...(action.disabledReason
                  ? { disabledReason: action.disabledReason }
                  : {}),
                ...(action.tone ? { tone: action.tone } : {}),
              }))}
            />
          )
        }
      >
        {data && (
          <div className={styles.statusRow}>
            <StatusPill tone={statusTone(data)}>{statusLabel(data)}</StatusPill>
            <span className={styles.muted}>{powerStateLabel(data)}</span>
            {data.locked && <StatusPill tone="neutral">Locked</StatusPill>}
            {data.flavor?.is_preemptible && (
              <StatusPill tone="warning">Preemptible</StatusPill>
            )}
          </div>
        )}
      </PageHeader>
      {data?.fault && (
        <Alert tone="danger" role="alert" className={styles.fault}>
          <strong>Fault:</strong> {data.fault.message ?? "unknown error"}
          {data.fault.created ? ` (${formatDateTime(data.fault.created)})` : ""}
        </Alert>
      )}
      <Tabs
        selectedKey={tab}
        onSelectionChange={selectTab}
        aria-label="Instance details"
      >
        <TabItem id="overview" title="Overview">
          {data ? <Overview instance={data} /> : <SkeletonLines lines={8} />}
        </TabItem>
        <TabItem id="interfaces" title="Interfaces">
          {data && (
            <Interfaces
              projectId={projectId}
              instance={data}
              onAttach={() => run([data], "attach-interface")}
            />
          )}
        </TabItem>
        <TabItem id="volumes" title="Volumes">
          {data && <Volumes projectId={projectId} instance={data} />}
        </TabItem>
        <TabItem id="security" title="Security groups">
          {data && (
            <SecurityGroups
              projectId={projectId}
              instance={data}
              onEdit={() => run([data], "security-groups")}
            />
          )}
        </TabItem>
        <TabItem id="log" title="Log">
          {data && (
            <Log
              projectId={projectId}
              instance={data}
              onConsole={() => run([data], "console")}
            />
          )}
        </TabItem>
        <TabItem id="actions" title="Action log">
          {data && <ActionLog projectId={projectId} instance={data} />}
        </TabItem>
      </Tabs>
      {dialogs}
    </>
  );
}

function Overview({ instance }: { instance: InstanceDetail }) {
  const flavor = instance.flavor;
  return (
    <div className={styles.grid}>
      <Panel title="Instance">
        <KeyValueList
          items={[
            { label: "Name", value: instance.name },
            { label: "ID", value: <code>{instance.id}</code> },
            { label: "Description", value: instance.description },
            { label: "Status", value: statusLabel(instance) },
            { label: "Power state", value: powerStateLabel(instance) },
            { label: "Availability zone", value: instance.availability_zone },
            { label: "Locked", value: instance.locked ? "Yes" : "No" },
            { label: "Created", value: formatDateTime(instance.created) },
            { label: "Updated", value: formatDateTime(instance.updated) },
            {
              label: "Host ID",
              value: instance.host_id ? <code>{instance.host_id}</code> : null,
            },
          ]}
        />
      </Panel>
      <Panel title="Specs">
        <KeyValueList
          items={[
            { label: "Flavour", value: flavor?.name },
            { label: "vCPUs", value: flavor?.vcpus },
            { label: "RAM", value: formatMb(flavor?.ram_mb) },
            { label: "Root disk", value: formatGb(flavor?.disk_gb) },
            { label: "Ephemeral disk", value: formatGb(flavor?.ephemeral_gb) },
            { label: "Service units", value: formatSuRate(flavor?.su_rate) },
            {
              label: "Image",
              value: instance.boot_from_volume ? (
                "Boot from volume"
              ) : instance.image ? (
                <RouteLink
                  to="/compute/images/$imageId"
                  params={{ imageId: instance.image.id }}
                >
                  {instance.image.name ?? instance.image.id}
                </RouteLink>
              ) : null,
            },
            { label: "Key pair", value: instance.key_name },
            {
              label: "Server groups",
              value:
                instance.server_group_ids.length > 0
                  ? instance.server_group_ids.join(", ")
                  : null,
            },
          ]}
        />
      </Panel>
      <Panel title="Addresses">
        {instance.addresses.length === 0 ? (
          <p className={styles.muted}>No addresses yet.</p>
        ) : (
          <KeyValueList
            items={instance.addresses.map((address) => ({
              label: `${address.network}${address.type === "floating" ? " (floating)" : ""}`,
              value: <code>{address.addr}</code>,
            }))}
          />
        )}
      </Panel>
      <Panel title="Metadata">
        {Object.keys(instance.metadata).length === 0 ? (
          <p className={styles.muted}>No metadata is set.</p>
        ) : (
          <KeyValueList
            items={Object.entries(instance.metadata).map(([key, value]) => ({
              label: key,
              value,
            }))}
          />
        )}
      </Panel>
    </div>
  );
}

function Interfaces({
  projectId,
  instance,
  onAttach,
}: {
  projectId: string;
  instance: InstanceDetail;
  onAttach: () => void;
}) {
  const ports = useQuery(instancePortsQuery(projectId, instance.id));
  const networks = useQuery(networksQuery(projectId, "any"));
  const action = useInstanceAction(projectId);
  const [detaching, setDetaching] = useState<InstancePort | null>(null);
  const names = useMemo(
    () => new Map((networks.data?.items ?? []).map((n) => [n.id, n.name])),
    [networks.data],
  );
  const columns: ColumnDef<InstancePort>[] = [
    {
      id: "network",
      label: "Network",
      isRowHeader: true,
      cell: (row) => names.get(row.network_id) ?? row.network_id,
    },
    {
      id: "fixed",
      label: "Fixed IPs",
      cell: (row) => <code>{row.fixed_ips.map((ip) => ip.ip).join(", ")}</code>,
    },
    {
      id: "floating",
      label: "Floating IPs",
      cell: (row) => (
        <code>{row.floating_ips.map((f) => f.address).join(", ")}</code>
      ),
      hideBelow: "md",
    },
    {
      id: "mac",
      label: "MAC address",
      cell: (row) => <code>{row.mac_address ?? ""}</code>,
      hideBelow: "lg",
    },
    {
      id: "status",
      label: "Status",
      cell: (row) => row.status ?? "",
      hideBelow: "md",
    },
    {
      id: "port_security",
      label: "Port security",
      cell: (row) =>
        row.port_security_enabled === null
          ? ""
          : row.port_security_enabled
            ? "On"
            : "Off",
      hideBelow: "lg",
    },
  ];
  return (
    <>
      <DataTable
        id="instance-interfaces"
        label="Interfaces"
        columns={columns}
        rows={ports.data?.items}
        getRowId={(row) => row.id}
        isLoading={ports.isPending}
        isFetching={ports.isFetching}
        error={ports.error}
        onRetry={() => void ports.refetch()}
        onRefresh={() => void ports.refetch()}
        emptyTitle="No interfaces"
        toolbarActions={
          <Button variant="primary" size="xs" onPress={onAttach}>
            Attach interface
          </Button>
        }
        rowActions={(row) => [
          {
            id: "detach",
            label: "Detach interface",
            tone: "danger",
            onAction: () => setDetaching(row),
          },
        ]}
      />
      <ConfirmDialog
        isOpen={detaching !== null}
        onOpenChange={(open) => !open && setDetaching(null)}
        title="Detach interface?"
        confirmLabel="Detach"
        isPending={action.isPending}
        error={action.error}
        onConfirm={() => {
          if (!detaching) return;
          action.mutate(
            {
              instanceId: instance.id,
              action: "detach-interface",
              body: { port_id: detaching.id },
            },
            {
              onSuccess: () => {
                notify.success("Interface detached.");
                setDetaching(null);
                void ports.refetch();
              },
            },
          );
        }}
      >
        <p>
          The port {detaching?.fixed_ips.map((ip) => ip.ip).join(", ")} is
          removed from the instance. Any floating IP on it is disassociated.
        </p>
      </ConfirmDialog>
    </>
  );
}

function Volumes({
  projectId,
  instance,
}: {
  projectId: string;
  instance: InstanceDetail;
}) {
  const volumes = useQuery(instanceVolumesQuery(projectId, instance.id));
  const columns: ColumnDef<InstanceVolume>[] = [
    { id: "name", label: "Name", isRowHeader: true, cell: (row) => row.name },
    {
      id: "device",
      label: "Device",
      cell: (row) => <code>{row.device ?? ""}</code>,
    },
    {
      id: "size",
      label: "Size",
      cell: (row) => formatGb(row.size_gb),
      hideBelow: "md",
    },
    { id: "status", label: "Status", cell: (row) => row.status ?? "" },
    {
      id: "bootable",
      label: "Bootable",
      cell: (row) => (row.bootable ? "Yes" : "No"),
      hideBelow: "lg",
    },
    {
      id: "type",
      label: "Type",
      cell: (row) => row.volume_type ?? "",
      hideBelow: "lg",
    },
  ];
  const [attaching, setAttaching] = useState(false);
  const [detaching, setDetaching] = useState<InstanceVolume | null>(null);
  const detach = useDetachVolume(projectId);
  // Nova attaches and detaches only on active or shut off instances.
  const ready = ["ACTIVE", "SHUTOFF"].includes(instance.status);
  const confirmDetach = () => {
    if (!detaching) return;
    const volume = detaching;
    detach.mutate(
      { volumeId: volume.id, instanceId: instance.id },
      {
        onSuccess: () => {
          notify.success(`Detaching ${volume.name} from ${instance.name}.`);
          setDetaching(null);
        },
      },
    );
  };
  return (
    <>
      <DataTable
        id="instance-volumes"
        label="Attached volumes"
        columns={columns}
        rows={volumes.data?.items}
        getRowId={(row) => row.id}
        isLoading={volumes.isPending}
        isFetching={volumes.isFetching}
        error={volumes.error}
        onRetry={() => void volumes.refetch()}
        onRefresh={() => void volumes.refetch()}
        toolbarActions={
          <Button
            variant="secondary"
            size="xs"
            onPress={() => setAttaching(true)}
            isDisabled={!ready}
          >
            Attach volume
          </Button>
        }
        rowActions={(row) => [
          {
            id: "detach",
            label: "Detach volume",
            tone: "danger",
            onAction: () => setDetaching(row),
            isDisabled: !ready,
            disabledReason: "The instance must be active or shut off",
          },
        ]}
        emptyTitle="No volumes attached"
        emptyBody={
          <p>
            Attach a volume for storage that outlives the instance, or manage
            volumes from the Volumes panel.
          </p>
        }
      />
      {attaching && (
        <AttachVolumeDialog
          projectId={projectId}
          instance={instance}
          onClose={() => setAttaching(false)}
        />
      )}
      <ConfirmDialog
        isOpen={detaching !== null}
        onOpenChange={(open) => !open && setDetaching(null)}
        title={`Detach ${detaching?.name ?? "volume"} from ${instance.name}?`}
        confirmLabel="Detach"
        tone="danger"
        isPending={detach.isPending}
        error={detach.error}
        onConfirm={confirmDetach}
      >
        <p>
          The data stays on the volume, and another instance can attach it
          afterwards. Unmount the volume inside the instance first.
        </p>
      </ConfirmDialog>
    </>
  );
}

function SecurityGroups({
  projectId,
  instance,
  onEdit,
}: {
  projectId: string;
  instance: InstanceDetail;
  onEdit: () => void;
}) {
  const groups = useQuery(securityGroupsQuery(projectId));
  const byName = new Map((groups.data?.items ?? []).map((g) => [g.name, g]));
  return (
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
        <ul className={styles.groups}>
          {instance.security_groups.map((name) => {
            const group = byName.get(name);
            return (
              <li key={name}>
                {group ? (
                  <RouteLink
                    to="/network/security-groups/$groupId"
                    params={{ groupId: group.id }}
                  >
                    {name}
                  </RouteLink>
                ) : (
                  name
                )}
                {group?.description && (
                  <span className={styles.muted}> {group.description}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

const LOG_LENGTHS = [35, 100, 500, 2000];

function Log({
  projectId,
  instance,
  onConsole,
}: {
  projectId: string;
  instance: InstanceDetail;
  onConsole: () => void;
}) {
  const [length, setLength] = useState(35);
  const log = useQuery(consoleOutputQuery(projectId, instance.id, length));
  return (
    <div className={styles.log}>
      <div className={styles.logBar}>
        <Select
          aria-label="Log length"
          labelPosition="side"
          selectedKey={String(length)}
          onSelectionChange={(key) => setLength(Number(key))}
          className={styles.logLength}
        >
          <Label>Lines</Label>
          {LOG_LENGTHS.map((n) => (
            <SelectItem key={n} id={String(n)} textValue={String(n)}>
              {String(n)}
            </SelectItem>
          ))}
        </Select>
        <Button
          variant="secondary"
          size="xs"
          onPress={() => void log.refetch()}
          isDisabled={log.isFetching}
        >
          Refresh
        </Button>
        <Button variant="primary" size="xs" onPress={onConsole}>
          Open console
        </Button>
      </div>
      {log.isPending ? (
        <SkeletonLines lines={6} />
      ) : log.isError ? (
        <ErrorState error={log.error} onRetry={() => void log.refetch()} />
      ) : (
        <CodeBlock
          label="Console log"
          text={log.data.output || "(the console log is empty)"}
          maxHeight="36rem"
        />
      )}
    </div>
  );
}

function ActionLog({
  projectId,
  instance,
}: {
  projectId: string;
  instance: InstanceDetail;
}) {
  const actions = useQuery(instanceActionLogQuery(projectId, instance.id));
  const columns: ColumnDef<InstanceAction>[] = [
    {
      id: "action",
      label: "Action",
      isRowHeader: true,
      cell: (row) => row.action,
      sortValue: (row) => row.action,
    },
    {
      id: "start_time",
      label: "Start time",
      cell: (row) => formatDateTime(row.start_time),
      sortValue: (row) => row.start_time,
    },
    {
      id: "user",
      label: "User ID",
      cell: (row) => <code>{row.user_id ?? ""}</code>,
      hideBelow: "lg",
    },
    {
      id: "request",
      label: "Request ID",
      cell: (row) => <code>{row.request_id}</code>,
      hideBelow: "md",
    },
    {
      id: "message",
      label: "Message",
      cell: (row) => row.message ?? "",
      hideBelow: "lg",
    },
  ];
  return (
    <DataTable
      id="instance-actions"
      label="Action log"
      columns={columns}
      rows={actions.data?.items}
      getRowId={(row) => `${row.request_id}-${row.start_time}`}
      isLoading={actions.isPending}
      isFetching={actions.isFetching}
      error={actions.error}
      onRetry={() => void actions.refetch()}
      onRefresh={() => void actions.refetch()}
      emptyTitle="No actions recorded"
      defaultSort={{ column: "start_time", direction: "descending" }}
    />
  );
}
