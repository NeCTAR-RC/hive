import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button, Label, Select, SelectItem } from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import { DataTable } from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { allows, toRowActions } from "../../../lib/actions";
import type { VolumeSourceType } from "../../../lib/api/types/volumes";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { volumeLimitsQuery, volumesQuery } from "../api";
import { instancesQuery } from "../../compute/api";
import { availableVolumeActions } from "../status";
import { AcceptTransferDialog } from "./dialogs/AcceptTransferDialog";
import { CreateVolumeDialog } from "./dialogs/CreateVolumeDialog";
import { createQuotaReason } from "./rules";
import { useVolumeActions } from "./VolumeActions";
import { useVolumeColumns } from "./useVolumeColumns";

const volumesRoute = getRouteApi("/app/storage/volumes");

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: "", label: "All statuses" },
  { id: "available", label: "Available" },
  { id: "in-use", label: "In use" },
  { id: "error", label: "Error" },
  { id: "creating", label: "Creating" },
  { id: "awaiting-transfer", label: "Awaiting transfer" },
];

const CRUMBS = [{ label: "Project" }, { label: "Volumes" }];

/**
 * The project's volumes, filterable by status, with every volume action in
 * the row menu and delete for a selection. The create dialog opens from the
 * URL (`?create=true`, plus `image`, `snapshot` or `volume` with an id to
 * start from that source), so a link from another page names its source.
 * Accept transfer takes a volume another project offers; like Create
 * volume, it needs room in the volume quota.
 */
export function VolumesPage() {
  const projectId = useProjectId();
  const search = useListSearch(volumesRoute);
  const status = search.params.status ?? "";
  const volumes = useQuery(volumesQuery(projectId));
  const table = useQueryTable(volumes, {
    noun: "volumes",
    search,
    placeholder: "Search by name, description or instance",
    filter: status ? (row) => row.status === status : undefined,
    resetKey: status,
  });
  const instances = useQuery(instancesQuery(projectId));
  const limits = useQuery(volumeLimitsQuery(projectId));
  const { run, dialogs, tableProps } = useVolumeActions();
  const [accepting, setAccepting] = useState(false);

  // The dialog opened here starts blank: only a link names a source.
  const setCreating = (create: boolean) =>
    search.patch({
      create,
      snapshot: undefined,
      image: undefined,
      volume: undefined,
    });

  const initialSource = useMemo<
    { type: VolumeSourceType; id: string } | undefined
  >(() => {
    if (search.params.snapshot)
      return { type: "snapshot", id: search.params.snapshot };
    if (search.params.image) return { type: "image", id: search.params.image };
    if (search.params.volume)
      return { type: "volume", id: search.params.volume };
    return undefined;
  }, [search.params.snapshot, search.params.image, search.params.volume]);

  const instanceNames = useMemo(
    () =>
      new Map(
        (instances.data?.items ?? []).map((i) => [i.id, i.name] as const),
      ),
    [instances.data],
  );

  const columns = useVolumeColumns(instanceNames);
  const quotaReason = createQuotaReason(limits.data);

  return (
    <>
      <PageHeader
        title="Volumes"
        crumbs={CRUMBS}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => setAccepting(true)}
              isDisabled={quotaReason !== null}
            >
              {quotaReason
                ? "Accept transfer (quota exceeded)"
                : "Accept transfer"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onPress={() => setCreating(true)}
              isDisabled={quotaReason !== null}
            >
              {quotaReason ? "Create volume (quota exceeded)" : "Create volume"}
            </Button>
          </>
        }
      />
      <DataTable
        id="volumes"
        label="Volumes"
        columns={columns}
        getRowId={(row) => row.id}
        {...table}
        {...tableProps}
        filters={
          <Select
            aria-label="Status"
            labelPosition="side"
            selectedKey={status}
            onSelectionChange={(key: Key | null) =>
              search.patch({ status: key === null ? "" : String(key) })
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
        emptyBody={
          <p>
            Volumes are persistent block storage you can attach to an instance.
          </p>
        }
        defaultSort={{ column: "created", direction: "descending" }}
        rowActions={(row) =>
          toRowActions(availableVolumeActions(row, limits.data), (id) =>
            run(id, [row]),
          )
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (rows) => run("delete", rows),
            isDisabled: (rows) =>
              !rows.some((row) =>
                allows(availableVolumeActions(row), "delete"),
              ),
          },
        ]}
      />
      {dialogs}
      {accepting && (
        <AcceptTransferDialog onClose={() => setAccepting(false)} />
      )}
      {search.params.create && (
        <CreateVolumeDialog
          onClose={() => setCreating(false)}
          initialSource={initialSource}
        />
      )}
    </>
  );
}
