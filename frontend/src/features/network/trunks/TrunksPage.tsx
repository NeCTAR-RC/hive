// The Trunks list, with Create trunk.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { AppLink } from "../../../components/AppLink/AppLink";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { toRowActions } from "../../../lib/actions";
import type { Trunk } from "../../../lib/api/types/network";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { trunksQuery } from "../api";
import {
  adminStateLabel,
  availableTrunkActions,
  statusLabel,
  statusTone,
} from "../status";
import { useTrunkActions } from "./TrunkActions";
import { CreateTrunkDialog } from "./dialogs/CreateTrunkDialog";

const trunksRoute = getRouteApi("/app/network/trunks");

const CRUMBS = [{ label: "Project" }, { label: "Network" }];

/** The Trunks list page with its row and batch actions. */
export function TrunksPage() {
  const projectId = useProjectId();
  const search = useListSearch(trunksRoute);
  const trunks = useQuery(trunksQuery(projectId));
  const table = useQueryTable(trunks, {
    noun: "trunks",
    search,
    placeholder: "Search by name or parent port",
  });
  const actions = useTrunkActions();
  const setCreating = (create: boolean) => search.patch({ create });

  const columns = useMemo<ColumnDef<Trunk>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/network/trunks/$trunkId"
            params={{ trunkId: row.id }}
          >
            {row.name || row.id}
          </AppLink>
        ),
        sortValue: (row) => row.name || row.id,
        textValue: (row) => `${row.name} ${row.id}`,
      },
      {
        id: "parent",
        label: "Parent port",
        cell: (row) =>
          row.port_id ? (
            <AppLink
              size="sm"
              to="/network/ports/$portId"
              params={{ portId: row.port_id }}
            >
              {row.port_name || row.port_id}
            </AppLink>
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
        getRowId={(row) => row.id}
        {...table}
        {...actions.tableProps}
        emptyBody={
          <p>
            A trunk lets one instance port carry several VLANs, each on its own
            subport.
          </p>
        }
        rowActions={(row) =>
          toRowActions(availableTrunkActions(row), (id) =>
            actions.run(id, [row]),
          )
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => actions.run("delete", selected),
          },
        ]}
      />
      {actions.dialogs}
      {search.params.create && (
        <CreateTrunkDialog onClose={() => setCreating(false)} />
      )}
    </>
  );
}
