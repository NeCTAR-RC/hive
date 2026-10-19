import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, Label, Select, SelectItem } from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { filterRows } from "../../../components/DataTable/filter";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { Volume, VolumeSourceType } from "../../../lib/api/types";
import { formatGb, formatRelative } from "../../../lib/format";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { volumesRoute } from "../../../app/router";
import {
  attachableInstancesQuery,
  volumeLimitsQuery,
  volumesQuery,
} from "../api";
import {
  attachmentLabel,
  availableVolumeActions,
  statusLabel,
  statusTone,
} from "../status";
import { useVolumeActions } from "./VolumeActions";
import { CreateVolumeDialog } from "./VolumeDialogs";
import styles from "./VolumesPage.module.scss";
import { RouteLink } from "../../../components/RouteLink/RouteLink";

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: "", label: "All statuses" },
  { id: "available", label: "Available" },
  { id: "in-use", label: "In use" },
  { id: "error", label: "Error" },
  { id: "creating", label: "Creating" },
];

const CRUMBS = [{ label: "Project" }, { label: "Volumes" }];

export function VolumesPage() {
  const projectId = useProjectId();
  const search = volumesRoute.useSearch();
  const navigate = useNavigate({ from: volumesRoute.fullPath });
  const volumes = useQuery(volumesQuery(projectId));
  const instances = useQuery(attachableInstancesQuery(projectId));
  const limits = useQuery(volumeLimitsQuery(projectId));
  const { run, runDelete, dialogs } = useVolumeActions(projectId);

  const q = search.q ?? "";
  const status = search.status ?? "";
  const setSearch = (patch: { q?: string; status?: string }) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous, ...patch };
        if (!next.q) delete next.q;
        if (!next.status) delete next.status;
        return next;
      },
      replace: true,
    });
  const setCreating = (open: boolean) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous };
        delete next.create;
        delete next.snapshot;
        delete next.image;
        delete next.volume;
        return open ? { ...next, create: true } : next;
      },
      replace: true,
    });

  const initialSource = useMemo<
    { type: VolumeSourceType; id: string } | undefined
  >(() => {
    if (search.snapshot) return { type: "snapshot", id: search.snapshot };
    if (search.image) return { type: "image", id: search.image };
    if (search.volume) return { type: "volume", id: search.volume };
    return undefined;
  }, [search.snapshot, search.image, search.volume]);

  const instanceNames = useMemo(
    () =>
      new Map(
        (instances.data?.items ?? []).map((i) => [i.id, i.name] as const),
      ),
    [instances.data],
  );

  const columns = useMemo<ColumnDef<Volume>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouteLink
            to="/storage/volumes/$volumeId"
            params={{ volumeId: row.id }}
          >
            {row.name || row.id}
          </RouteLink>
        ),
        sortValue: (row) => row.name || row.id,
        textValue: (row) => `${row.name} ${row.id}`,
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => row.description ?? "",
        textValue: (row) => row.description ?? "",
        hideBelow: "lg",
      },
      {
        id: "size",
        label: "Size",
        cell: (row) => formatGb(row.size_gb),
        sortValue: (row) => row.size_gb ?? 0,
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row.status)}>
            {statusLabel(row.status)}
          </StatusPill>
        ),
        sortValue: (row) => row.status,
      },
      {
        id: "type",
        label: "Type",
        cell: (row) => row.volume_type ?? "",
        sortValue: (row) => row.volume_type ?? "",
        hideBelow: "md",
      },
      {
        id: "attachments",
        label: "Attached to",
        cell: (row) =>
          row.attachments.length === 0 ? (
            ""
          ) : (
            <ul className={styles.attachments}>
              {row.attachments.map((attachment) => (
                <li key={attachment.id ?? attachment.server_id ?? ""}>
                  {attachment.server_id ? (
                    <RouteLink
                      to="/compute/instances/$instanceId"
                      params={{ instanceId: attachment.server_id }}
                    >
                      {attachmentLabel(
                        attachment,
                        instanceNames.get(attachment.server_id),
                      )}
                    </RouteLink>
                  ) : (
                    attachmentLabel(attachment, undefined)
                  )}
                </li>
              ))}
            </ul>
          ),
        textValue: (row) =>
          row.attachments
            .map((a) =>
              attachmentLabel(
                a,
                a.server_id ? instanceNames.get(a.server_id) : undefined,
              ),
            )
            .join(" "),
        hideBelow: "md",
      },
      {
        id: "availability_zone",
        label: "Availability zone",
        cell: (row) => row.availability_zone ?? "",
        sortValue: (row) => row.availability_zone ?? "",
        hideBelow: "lg",
      },
      {
        id: "bootable",
        label: "Bootable",
        cell: (row) => (row.bootable ? "Yes" : "No"),
        sortValue: (row) => (row.bootable ? 1 : 0),
        hideBelow: "lg",
      },
      {
        id: "encrypted",
        label: "Encrypted",
        cell: (row) => (row.encrypted ? "Yes" : "No"),
        hideBelow: "lg",
        defaultHidden: true,
      },
      {
        id: "created",
        label: "Age",
        cell: (row) =>
          row.created_at ? (
            <time dateTime={row.created_at} title={row.created_at}>
              {formatRelative(row.created_at)}
            </time>
          ) : (
            ""
          ),
        sortValue: (row) => row.created_at ?? "",
        hideBelow: "md",
      },
    ],
    [instanceNames],
  );

  const rows = useMemo(() => {
    let list = volumes.data?.items ?? [];
    if (status) list = list.filter((row) => row.status === status);
    return filterRows(list, q, columns);
  }, [volumes.data, status, q, columns]);

  const quotaReason = (() => {
    const data = limits.data;
    if (!data) return null;
    const maxVolumes = data.maxTotalVolumes ?? -1;
    if (maxVolumes >= 0 && (data.totalVolumesUsed ?? 0) >= maxVolumes)
      return "You are using all of your available volumes";
    const maxGb = data.maxTotalVolumeGigabytes ?? -1;
    if (maxGb >= 0 && (data.totalGigabytesUsed ?? 0) >= maxGb)
      return "You are using all of your volume storage quota";
    return null;
  })();

  return (
    <>
      <PageHeader
        title="Volumes"
        crumbs={CRUMBS}
        actions={
          <Button
            variant="primary"
            size="sm"
            onPress={() => setCreating(true)}
            isDisabled={quotaReason !== null}
          >
            {quotaReason ? "Create volume (quota exceeded)" : "Create volume"}
          </Button>
        }
      />
      <DataTable
        id="volumes"
        label="Volumes"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={volumes.isPending}
        isFetching={volumes.isFetching}
        error={volumes.error}
        onRetry={() => void volumes.refetch()}
        onRefresh={() => void volumes.refetch()}
        search={{
          value: q,
          onChange: (value) => setSearch({ q: value }),
          placeholder: "Search by name, description or instance",
        }}
        resetKey={`${q}|${status}`}
        filters={
          <Select
            aria-label="Status"
            labelPosition="side"
            className={styles.statusFilter}
            selectedKey={status}
            onSelectionChange={(key: Key | null) =>
              setSearch({ status: key === null ? "" : String(key) })
            }
          >
            <Label>Status</Label>
            {STATUS_FILTERS.map((option) => (
              <SelectItem
                key={option.id}
                id={option.id}
                textValue={option.label}
              >
                {option.label}
              </SelectItem>
            ))}
          </Select>
        }
        emptyTitle={
          volumes.data && volumes.data.items.length > 0
            ? "No volumes match"
            : "No volumes yet"
        }
        emptyBody={
          volumes.data && volumes.data.items.length === 0 ? (
            <p>
              Volumes are persistent block storage you can attach to an
              instance.
            </p>
          ) : null
        }
        defaultSort={{ column: "created", direction: "descending" }}
        rowActions={(row) =>
          availableVolumeActions(row, limits.data).map((action) => ({
            id: action.id,
            label: action.label,
            onAction: () => run(row, action.id),
            isDisabled: action.isDisabled,
            ...(action.disabledReason
              ? { disabledReason: action.disabledReason }
              : {}),
            ...(action.tone ? { tone: action.tone } : {}),
          }))
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => runDelete(selected),
            isDisabled: (selected) =>
              selected.some(
                (row) =>
                  availableVolumeActions(row).find((a) => a.id === "delete")
                    ?.isDisabled,
              ),
          },
        ]}
      />
      {dialogs}
      <CreateVolumeDialog
        key={`${search.create ? "open" : "closed"}:${initialSource?.id ?? ""}`}
        projectId={projectId}
        isOpen={Boolean(search.create)}
        onOpenChange={setCreating}
        initialSource={initialSource}
      />
    </>
  );
}
