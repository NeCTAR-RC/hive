import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
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
import type { TrunkSubport } from "../../../lib/api/types";
import { formatDateTime } from "../../../lib/format";
import { notify } from "../../../lib/notify";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { trunkRoute } from "../../../app/router";
import { trunkQuery, useRemoveSubports } from "../api";
import {
  adminStateLabel,
  availableTrunkActions,
  statusLabel,
  statusTone,
} from "../status";
import { useTrunkActions } from "./TrunkActions";
import { AddSubportsDialog } from "./TrunkDialogs";
import styles from "./TrunkDetailPage.module.scss";

const CRUMBS = [
  { label: "Project" },
  { label: "Network" },
  { label: "Trunks", href: "/network/trunks" },
];

export function TrunkDetailPage() {
  const projectId = useProjectId();
  const { trunkId } = trunkRoute.useParams();
  const navigate = useNavigate();
  const trunk = useQuery(trunkQuery(projectId, trunkId));
  const removeSubports = useRemoveSubports(projectId);
  const actions = useTrunkActions(
    projectId,
    () => void navigate({ to: "/network/trunks", search: {} }),
  );
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TrunkSubport[] | null>(null);
  const columns = useMemo<ColumnDef<TrunkSubport>[]>(
    () => [
      {
        id: "port",
        label: "Port",
        isRowHeader: true,
        cell: (row) =>
          row.port_id ? (
            <RouterLink
              to="/network/ports/$portId"
              params={{ portId: row.port_id }}
            >
              {row.port_name || row.port_id}
            </RouterLink>
          ) : (
            ""
          ),
        sortValue: (row) => row.port_name ?? row.port_id ?? "",
      },
      {
        id: "type",
        label: "Segmentation type",
        cell: (row) => (row.segmentation_type ?? "").toUpperCase(),
      },
      {
        id: "id",
        label: "Segmentation id",
        cell: (row) => row.segmentation_id ?? "",
        sortValue: (row) => row.segmentation_id ?? 0,
      },
    ],
    [],
  );

  if (trunk.isError) {
    const notFound =
      trunk.error instanceof ApiError && trunk.error.status === 404;
    return (
      <>
        <PageHeader
          title={notFound ? "Trunk not found" : "Trunk"}
          crumbs={CRUMBS}
        />
        {notFound ? (
          <p>
            There is no trunk <code>{trunkId}</code> in this project.{" "}
            <RouterLink to="/network/trunks" search={{}}>
              Back to trunks
            </RouterLink>
          </p>
        ) : (
          <ErrorState
            error={trunk.error}
            onRetry={() => void trunk.refetch()}
          />
        )}
      </>
    );
  }

  const data = trunk.data;
  const confirmRemove = (targets: TrunkSubport[]) => {
    if (!data) return;
    removeSubports.mutate(
      {
        trunkId: data.id,
        portIds: targets
          .map((s) => s.port_id)
          .filter((id): id is string => !!id),
      },
      {
        onSuccess: () => {
          notify.success(
            targets.length === 1
              ? "Subport removed."
              : `${targets.length} subports removed.`,
          );
          setRemoving(null);
        },
      },
    );
  };
  return (
    <>
      <PageHeader
        title={data ? data.name || data.id : "Trunk"}
        crumbs={CRUMBS}
        actions={
          data && (
            <RowActionsMenu
              actions={availableTrunkActions(data).map((action) => ({
                id: action.id,
                label: action.label,
                onAction: () => actions.run(data, action.id),
                isDisabled: action.isDisabled,
                ...(action.tone ? { tone: action.tone } : {}),
              }))}
            />
          )
        }
      />
      <div className={styles.grid}>
        <Panel title="Overview">
          {!data ? (
            <SkeletonLines lines={8} />
          ) : (
            <KeyValueList
              items={[
                { label: "Name", value: data.name },
                { label: "ID", value: <code>{data.id}</code> },
                { label: "Description", value: data.description || null },
                {
                  label: "Status",
                  value: (
                    <StatusPill tone={statusTone(data.status)}>
                      {statusLabel(data.status)}
                    </StatusPill>
                  ),
                },
                {
                  label: "Admin state",
                  value: adminStateLabel(data.admin_state_up),
                },
                {
                  label: "Parent port",
                  value: data.port_id ? (
                    <RouterLink
                      to="/network/ports/$portId"
                      params={{ portId: data.port_id }}
                    >
                      {data.port_name || data.port_id}
                    </RouterLink>
                  ) : null,
                },
                { label: "Created", value: formatDateTime(data.created_at) },
                { label: "Updated", value: formatDateTime(data.updated_at) },
              ]}
            />
          )}
        </Panel>
        <Panel
          title="Subports"
          actions={
            data && (
              <Button
                variant="secondary"
                size="xs"
                onPress={() => setAdding(true)}
              >
                Add subports
              </Button>
            )
          }
        >
          <DataTable
            id="trunk-subports"
            label="Subports"
            columns={columns}
            rows={data?.sub_ports}
            getRowId={(row) => row.port_id ?? ""}
            isLoading={trunk.isPending}
            emptyTitle="No subports"
            emptyBody={
              <p>Each subport carries one VLAN over the parent port.</p>
            }
            rowActions={(row) => [
              {
                id: "remove",
                label: "Remove subport",
                tone: "danger",
                onAction: () => setRemoving([row]),
              },
            ]}
            batchActions={[
              {
                id: "remove",
                label: "Remove",
                tone: "danger",
                onAction: (selected) => setRemoving(selected),
              },
            ]}
          />
        </Panel>
      </div>
      {actions.dialogs}
      {adding && data && (
        <AddSubportsDialog
          projectId={projectId}
          trunk={data}
          onClose={() => setAdding(false)}
        />
      )}
      <ConfirmDialog
        isOpen={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={
          removing && removing.length > 1
            ? `Remove ${removing.length} subports?`
            : `Remove subport ${removing?.[0]?.port_name || removing?.[0]?.port_id || ""}?`
        }
        confirmLabel="Remove"
        tone="danger"
        isPending={removeSubports.isPending}
        error={removeSubports.error}
        onConfirm={() => removing && confirmRemove(removing)}
      >
        <p>The port itself is kept; it just leaves the trunk.</p>
      </ConfirmDialog>
    </>
  );
}
