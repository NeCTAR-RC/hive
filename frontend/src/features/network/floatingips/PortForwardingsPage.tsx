// Every port forwarding rule of the project's unassociated floating IPs,
// or one IP's rules when `?floating_ip=` is given (Horizon's "show" view).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button, Label, Select, SelectItem } from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { DataTable } from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import type { PortForwarding } from "../../../lib/api/types/network";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import {
  deletePortForwarding,
  floatingIpsQuery,
  portForwardingWriteKeys,
  portForwardingsQuery,
} from "../api";
import { PortForwardingDialog } from "./dialogs/PortForwardingDialog";
import { portForwardingColumns } from "./portForwardingColumns";

const portForwardingsRoute = getRouteApi("/app/network/port-forwardings");

/** The rule dialog that is open: adding to the chosen IP, or editing. */
type Dialog = { kind: "add" } | { kind: "edit"; rule: PortForwarding } | null;

/** A rule as toasts name it: its external address and port. */
const ruleName = (rule: PortForwarding) =>
  `${rule.floating_ip_address}:${rule.external_port}`;

const CRUMBS = [
  { label: "Project" },
  { label: "Network" },
  { label: "Floating IPs", href: "/network/floating-ips" },
];

/**
 * The port forwarding rules list, filtered by floating IP in the URL. Add
 * rule waits for an unassociated IP to be chosen.
 */
export function PortForwardingsPage() {
  const projectId = useProjectId();
  const search = useListSearch(portForwardingsRoute);
  const floatingIpId = search.params.floating_ip ?? "";
  const rules = useQuery(
    portForwardingsQuery(projectId, floatingIpId || undefined),
  );
  const table = useQueryTable(rules, {
    noun: "port forwarding rules",
    emptyTitle: "No port forwarding rules",
    noMatchTitle: "No rules match",
    search,
    placeholder: "Search by address, port or description",
    resetKey: floatingIpId,
  });
  const fips = useQuery(floatingIpsQuery(projectId));
  const [dialog, setDialog] = useState<Dialog>(null);
  const bulk = useBulkAction<PortForwarding, "delete">({
    noun: { one: "port forwarding rule", many: "port forwarding rules" },
    name: ruleName,
    getId: (rule) => rule.id,
    invalidates: portForwardingWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        // `eligible` lets through only rules that name their IP.
        request: (rule) =>
          deletePortForwarding(rule.floating_ip_id ?? "", rule.id),
        eligible: (rule) => Boolean(rule.floating_ip_id),
        skippedWhy: "they belong to no floating IP",
        title: (rules) =>
          rules.length === 1
            ? "Delete this port forwarding rule?"
            : `Delete ${rules.length} rules?`,
        body: <p>This cannot be undone.</p>,
      },
    },
  });

  // Rules can only be added to IPs that are not associated with a port.
  const candidates = useMemo(
    () => (fips.data?.items ?? []).filter((f) => !f.port_id),
    [fips.data],
  );
  const selected = candidates.find((f) => f.id === floatingIpId);

  return (
    <>
      <PageHeader
        title={
          selected
            ? `Port forwarding rules for ${selected.floating_ip_address}`
            : "Port forwarding rules"
        }
        crumbs={CRUMBS}
        actions={
          <Button
            variant="primary"
            size="sm"
            onPress={() => setDialog({ kind: "add" })}
            isDisabled={!selected}
          >
            Add rule
          </Button>
        }
      />
      <DataTable
        id="port-forwardings"
        label="Port forwarding rules"
        columns={portForwardingColumns}
        getRowId={(row) => row.id}
        {...table}
        {...bulk.tableProps}
        filters={
          <Select
            aria-label="Floating IP"
            labelPosition="side"
            selectedKey={floatingIpId}
            onSelectionChange={(key: Key | null) =>
              search.patch({ floating_ip: key === null ? "" : String(key) })
            }
          >
            <Label>Floating IP</Label>
            <SelectItem id="" textValue="All unassociated IPs">
              All unassociated IPs
            </SelectItem>
            {candidates.map((f) => (
              <SelectItem
                key={f.id}
                id={f.id}
                textValue={f.floating_ip_address ?? f.id}
              >
                {f.floating_ip_address ?? f.id}
              </SelectItem>
            ))}
          </Select>
        }
        emptyBody={
          <p>
            A rule binds a port on an unassociated floating IP to a port on an
            internal address. Choose a floating IP above to add one.
          </p>
        }
        rowActions={(row) => [
          {
            id: "edit",
            label: "Edit rule",
            onAction: () => setDialog({ kind: "edit", rule: row }),
          },
          {
            id: "delete",
            label: "Delete rule",
            tone: "danger",
            onAction: () => bulk.run("delete", [row]),
          },
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (chosen) => bulk.run("delete", chosen),
          },
        ]}
      />
      {dialog?.kind === "add" && selected && (
        <PortForwardingDialog
          floatingIp={selected}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "edit" && dialog.rule.floating_ip_id && (
        <PortForwardingDialog
          floatingIp={{
            id: dialog.rule.floating_ip_id,
            floating_ip_address: dialog.rule.floating_ip_address,
          }}
          rule={dialog.rule}
          onClose={() => setDialog(null)}
        />
      )}
      {bulk.dialog}
    </>
  );
}
