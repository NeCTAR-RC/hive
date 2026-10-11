import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { filterRows } from "../../../components/DataTable/filter";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { Trunk } from "../../../lib/api/types";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { trunksRoute } from "../../../app/router";
import { trunksQuery } from "../api";
import {
  adminStateLabel,
  availableTrunkActions,
  statusLabel,
  statusTone,
} from "../status";
import { useTrunkActions } from "./TrunkActions";
import { CreateTrunkDialog } from "./TrunkDialogs";

const CRUMBS = [{ label: "Project" }, { label: "Network" }];

export function TrunksPage() {
  const projectId = useProjectId();
  const search = trunksRoute.useSearch();
  const navigate = useNavigate({ from: trunksRoute.fullPath });
  const trunks = useQuery(trunksQuery(projectId));
  const { run, runDelete, dialogs } = useTrunkActions(projectId);

  const q = search.q ?? "";
  const setSearch = (patch: { q?: string }) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous, ...patch };
        if (!next.q) delete next.q;
        return next;
      },
      replace: true,
    });
  const setCreating = (open: boolean) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous };
        delete next.create;
        return open ? { ...next, create: true } : next;
      },
      replace: true,
    });

  const columns = useMemo<ColumnDef<Trunk>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/network/trunks/$trunkId"
            params={{ trunkId: row.id }}
          >
            {row.name || row.id}
          </RouterLink>
        ),
        sortValue: (row) => row.name || row.id,
        textValue: (row) => `${row.name} ${row.id}`,
      },
      {
        id: "parent",
        label: "Parent port",
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
        textValue: (row) => row.port_name ?? row.port_id ?? "",
      },
      {
        id: "subports",
        label: "Subports",
        cell: (row) => row.subport_count,
        sortValue: (row) => row.subport_count,
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
        id: "admin_state",
        label: "Admin state",
        cell: (row) => adminStateLabel(row.admin_state_up),
        hideBelow: "md",
      },
    ],
    [],
  );
  const rows = useMemo(
    () => filterRows(trunks.data?.items ?? [], q, columns),
    [trunks.data, q, columns],
  );
  return (
    <>
      <PageHeader
        title="Trunks"
        crumbs={CRUMBS}
        actions={
          <Button variant="primary" size="sm" onPress={() => setCreating(true)}>
            Create trunk
          </Button>
        }
      />
      <DataTable
        id="trunks"
        label="Trunks"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={trunks.isPending}
        isFetching={trunks.isFetching}
        error={trunks.error}
        onRetry={() => void trunks.refetch()}
        onRefresh={() => void trunks.refetch()}
        search={{
          value: q,
          onChange: (value) => setSearch({ q: value }),
          placeholder: "Search by name or parent port",
        }}
        resetKey={q}
        emptyTitle={
          trunks.data && trunks.data.items.length > 0
            ? "No trunks match"
            : "No trunks yet"
        }
        emptyBody={
          trunks.data && trunks.data.items.length === 0 ? (
            <p>
              A trunk lets one instance port carry several VLANs, each on its
              own subport.
            </p>
          ) : null
        }
        rowActions={(row) =>
          availableTrunkActions(row).map((action) => ({
            id: action.id,
            label: action.label,
            onAction: () => run(row, action.id),
            isDisabled: action.isDisabled,
            ...(action.tone ? { tone: action.tone } : {}),
          }))
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => runDelete(selected),
          },
        ]}
      />
      {dialogs}
      <CreateTrunkDialog
        key={search.create ? "open" : "closed"}
        projectId={projectId}
        isOpen={Boolean(search.create)}
        onOpenChange={setCreating}
      />
    </>
  );
}
