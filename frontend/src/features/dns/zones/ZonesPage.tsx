// Zones (designate-dashboard zones panel): the project's DNS zones, with
// create, edit and delete and the zone quota.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { QuotaMeter } from "../../../components/QuotaMeter/QuotaMeter";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { allows, toRowActions } from "../../../lib/actions";
import type { Zone } from "../../../lib/api/types/dns";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { zonesQuery } from "../api";
import { availableZoneActions, statusLabel, statusTone } from "../status";
import { useZoneActions } from "./ZoneActions";
import { CreateZoneDialog } from "./dialogs/CreateZoneDialog";
import styles from "../Dns.module.scss";

const zonesRoute = getRouteApi("/app/dns/zones");

/** The project's DNS zones with the zone quota and the zone actions. */
export function ZonesPage() {
  const projectId = useProjectId();
  const zones = useQuery(zonesQuery(projectId));
  const search = useListSearch(zonesRoute);
  const table = useQueryTable(zones, {
    noun: "zones",
    search,
    placeholder: "Search zones",
  });
  const { run, dialogs, tableProps } = useZoneActions();
  const creating = search.params.create === true;
  const setCreating = (create: boolean) => search.patch({ create });

  const columns = useMemo<ColumnDef<Zone>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/dns/zones/$zoneId"
            params={{ zoneId: row.id }}
          >
            {row.name}
          </AppLink>
        ),
        sortValue: (row) => row.name,
        textValue: (row) =>
          `${row.name} ${row.description ?? ""} ${row.email ?? ""}`,
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
          <StatusPill tone={statusTone(row.status)}>
            {statusLabel(row.status, row.action)}
          </StatusPill>
        ),
        sortValue: (row) => row.status ?? "",
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => row.description ?? "",
        hideBelow: "lg",
      },
    ],
    [],
  );
  const quota = zones.data?.quota ?? {};
  const limit = typeof quota["zones"] === "number" ? quota["zones"] : null;
  const used = zones.data?.items.length ?? 0;

  return (
    <>
      <PageHeader
        title="Zones"
        crumbs={[{ label: "Project" }, { label: "DNS" }]}
        actions={
          <Button
            size="sm"
            onPress={() => setCreating(true)}
            isDisabled={limit !== null && limit >= 0 && used >= limit}
          >
            Create zone
          </Button>
        }
      >
        {zones.data && limit !== null && (
          <div className={styles.meters}>
            <QuotaMeter label="Zones" value={used} max={limit} />
          </div>
        )}
      </PageHeader>
      <DataTable
        id="zones"
        label="Zones"
        columns={columns}
        getRowId={(row) => row.id}
        {...table}
        {...tableProps}
        emptyBody={
          <p>Create a zone to manage DNS records for a domain you own.</p>
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) =>
          toRowActions(availableZoneActions(row), (id) => run(id, [row]))
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            isDisabled: (selected) =>
              !selected.some((z) => allows(availableZoneActions(z), "delete")),
            onAction: (selected) => run("delete", selected),
          },
        ]}
      />
      {creating && <CreateZoneDialog onClose={() => setCreating(false)} />}
      {dialogs}
    </>
  );
}
