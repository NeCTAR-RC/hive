// A trunk's detail page: its fields, and its subports with add and
// remove.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import { REMOVE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { DataTable } from "../../../components/DataTable/DataTable";
import { RowActionsMenu } from "../../../components/DataTable/RowActionsMenu";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { toRowActions } from "../../../lib/actions";
import type { TrunkSubport } from "../../../lib/api/types/network";
import { formatDateTime } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { removeSubports, trunkQuery, trunkWriteKeys } from "../api";
import {
  adminStateLabel,
  availableTrunkActions,
  statusLabel,
  statusTone,
} from "../status";
import { useTrunkActions } from "./TrunkActions";
import { AddSubportsDialog } from "./dialogs/AddSubportsDialog";
import { subportColumns } from "./subportColumns";
import styles from "./TrunkDetailPage.module.scss";

const trunkRoute = getRouteApi("/app/network/trunks/$trunkId");

const CRUMBS = [
  { label: "Project" },
  { label: "Network" },
  { label: "Trunks", href: "/network/trunks" },
];

/** The ports of `subports`; a subport without one cannot be removed. */
function portIds(subports: TrunkSubport[]): string[] {
  return subports.flatMap((subport) =>
    subport.port_id ? [subport.port_id] : [],
  );
}

/** One trunk with its actions in the header and its subports. */
export function TrunkDetailPage() {
  const projectId = useProjectId();
  const { trunkId } = trunkRoute.useParams();
  const navigate = useNavigate();
  const trunk = useQuery(trunkQuery(projectId, trunkId));
  const actions = useTrunkActions(
    () => void navigate({ to: "/network/trunks", search: {} }),
  );
  const subports = useBulkAction<TrunkSubport, "remove">({
    noun: { one: "subport", many: "subports" },
    name: (subport) => subport.port_name || subport.port_id || "",
    getId: (subport) => subport.port_id ?? "",
    invalidates: trunkWriteKeys,
    actions: {
      remove: {
        verb: REMOVE,
        // The trunk takes every port to remove in one request.
        batch: async (targets) => {
          await removeSubports(trunkId, portIds(targets));
          return { succeeded: targets, failed: [] };
        },
        eligible: (subport) => Boolean(subport.port_id),
        skippedWhy: "they have no port",
        body: <p>The port itself is kept; it just leaves the trunk.</p>,
      },
    },
  });
  const [adding, setAdding] = useState(false);

  return (
    <>
      <DetailPage
        query={trunk}
        noun="trunk"
        id={trunkId}
        crumbs={CRUMBS}
        backTo={{ label: "trunks", href: "/network/trunks" }}
        title={(data) => data.name || data.id}
        actions={(data) => (
          <RowActionsMenu
            actions={toRowActions(availableTrunkActions(data), (id) =>
              actions.run(id, [data]),
            )}
          />
        )}
      >
        {(data) => (
          <div className={styles.grid}>
            <Panel title="Trunk">
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
                      <AppLink
                        to="/network/ports/$portId"
                        params={{ portId: data.port_id }}
                      >
                        {data.port_name || data.port_id}
                      </AppLink>
                    ) : null,
                  },
                  { label: "Created", value: formatDateTime(data.created_at) },
                  { label: "Updated", value: formatDateTime(data.updated_at) },
                ]}
              />
            </Panel>
            <Panel
              title="Subports"
              actions={
                <Button
                  variant="secondary"
                  size="xs"
                  onPress={() => setAdding(true)}
                >
                  Add subports
                </Button>
              }
            >
              <DataTable
                id="trunk-subports"
                label="Subports"
                columns={subportColumns}
                rows={data.sub_ports}
                getRowId={(row) => row.port_id ?? ""}
                {...subports.tableProps}
                emptyTitle="No subports"
                emptyBody={
                  <p>Each subport carries one VLAN over the parent port.</p>
                }
                rowActions={(row) => [
                  {
                    id: "remove",
                    label: "Remove subport",
                    tone: "danger",
                    onAction: () => subports.run("remove", [row]),
                  },
                ]}
                batchActions={[
                  {
                    id: "remove",
                    label: "Remove",
                    tone: "danger",
                    onAction: (selected) => subports.run("remove", selected),
                  },
                ]}
              />
            </Panel>
          </div>
        )}
      </DetailPage>
      {actions.dialogs}
      {adding && trunk.data && (
        <AddSubportsDialog
          trunk={trunk.data}
          onClose={() => setAdding(false)}
        />
      )}
      {subports.dialog}
    </>
  );
}
