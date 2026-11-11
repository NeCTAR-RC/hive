// One zone: its details and record sets (designate-dashboard zone detail
// and record sets panel). SOA and apex NS record sets are read-only.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { DataTable } from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { allows, toRowActions } from "../../../lib/actions";
import type { RecordSet } from "../../../lib/api/types/dns";
import { formatDateTime } from "../../../lib/format";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { deleteRecordSet, dnsWriteKeys, recordSetsQuery } from "../api";
import {
  availableRecordSetActions,
  availableZoneActions,
  statusLabel,
  statusTone,
} from "../status";
import { CreateRecordSetDialog } from "./dialogs/CreateRecordSetDialog";
import { EditRecordSetDialog } from "./dialogs/EditRecordSetDialog";
import { recordSetColumns } from "./recordSetColumns";
import { useZoneActions } from "./ZoneActions";
import styles from "../Dns.module.scss";

const zoneRoute = getRouteApi("/app/dns/zones/$zoneId");

type Dialog =
  { kind: "create" } | { kind: "edit"; recordset: RecordSet } | null;

/** Whether the record set's menu lets it be deleted now. */
const canDelete = (recordset: RecordSet) =>
  allows(availableRecordSetActions(recordset), "delete");

/**
 * One zone's details and record sets, with the zone's Edit and Delete in
 * the header; a delete returns to the zones list.
 */
export function ZoneDetailPage() {
  const projectId = useProjectId();
  const { zoneId } = zoneRoute.useParams();
  const navigate = useNavigate();
  const recordsets = useQuery(recordSetsQuery(projectId, zoneId));
  const search = useListSearch(zoneRoute);
  const table = useQueryTable(recordsets, {
    noun: "record sets",
    emptyTitle: "No record sets",
    search,
    placeholder: "Search record sets",
  });
  const zoneActions = useZoneActions(() => void navigate({ to: "/dns/zones" }));
  const deleteRecordSets = useBulkAction<RecordSet, "delete">({
    noun: { one: "record set", many: "record sets" },
    name: (recordset) => recordset.name ?? recordset.id,
    getId: (recordset) => recordset.id,
    invalidates: dnsWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (recordset) => deleteRecordSet(zoneId, recordset.id),
        body: <p>The records stop resolving once the change is published.</p>,
        eligible: canDelete,
      },
    },
  });
  const [dialog, setDialog] = useState<Dialog>(null);

  return (
    <>
      <DetailPage
        query={recordsets}
        select={(data) => data.zone}
        noun="zone"
        id={zoneId}
        crumbs={[
          { label: "Project" },
          { label: "DNS" },
          { label: "Zones", href: "/dns/zones" },
        ]}
        backTo={{ label: "zones", href: "/dns/zones" }}
        title={(zone) => zone.name}
        actions={(zone) => {
          const zoneOffers = availableZoneActions(zone);
          return (
            <>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => zoneActions.run("edit", [zone])}
                isDisabled={!allows(zoneOffers, "edit")}
              >
                Edit zone
              </Button>
              <Button
                variant="secondary"
                tone="danger"
                size="sm"
                onPress={() => zoneActions.run("delete", [zone])}
                isDisabled={!allows(zoneOffers, "delete")}
              >
                Delete zone
              </Button>
            </>
          );
        }}
      >
        {(zone) => (
          <div className={styles.stack}>
            <Panel title="Zone" headingLevel={2}>
              <KeyValueList
                items={[
                  {
                    label: "Status",
                    value: (
                      <StatusPill tone={statusTone(zone.status)}>
                        {statusLabel(zone.status, zone.action)}
                      </StatusPill>
                    ),
                  },
                  { label: "Type", value: zone.type },
                  { label: "Contact email", value: zone.email },
                  { label: "Default TTL", value: zone.ttl },
                  { label: "Serial", value: zone.serial },
                  { label: "Description", value: zone.description },
                  {
                    label: "Masters",
                    value: zone.masters.join(", "),
                  },
                  {
                    label: "Created",
                    value: formatDateTime(zone.created_at),
                  },
                  { label: "ID", value: <code>{zone.id}</code> },
                ]}
              />
            </Panel>
            <DataTable
              id="recordsets"
              label="Record sets"
              columns={recordSetColumns}
              getRowId={(row) => row.id}
              {...table}
              {...deleteRecordSets.tableProps}
              toolbarActions={
                <Button
                  size="xs"
                  onPress={() => setDialog({ kind: "create" })}
                  isDisabled={zone.is_transitional}
                >
                  Create record set
                </Button>
              }
              defaultSort={{ column: "name", direction: "ascending" }}
              rowActions={(row) =>
                toRowActions(availableRecordSetActions(row), (id) =>
                  id === "edit"
                    ? setDialog({ kind: "edit", recordset: row })
                    : deleteRecordSets.run(id, [row]),
                )
              }
              batchActions={[
                {
                  id: "delete",
                  label: "Delete",
                  tone: "danger",
                  isDisabled: (selected) => !selected.some(canDelete),
                  onAction: (selected) =>
                    deleteRecordSets.run("delete", selected),
                },
              ]}
            />
          </div>
        )}
      </DetailPage>
      {dialog?.kind === "create" && recordsets.data && (
        <CreateRecordSetDialog
          zone={recordsets.data.zone}
          onEditInstead={(recordset) => setDialog({ kind: "edit", recordset })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "edit" && recordsets.data && (
        <EditRecordSetDialog
          zone={recordsets.data.zone}
          recordset={dialog.recordset}
          onClose={() => setDialog(null)}
        />
      )}
      {deleteRecordSets.dialog}
      {zoneActions.dialogs}
    </>
  );
}
