// The share detail page's access rules tab (manila-ui manage rules page).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ardc-ui/react";
import { DELETE } from "../../../../components/BulkAction/messages";
import { useBulkAction } from "../../../../components/BulkAction/useBulkAction";
import { CopyButton } from "../../../../components/CopyButton/CopyButton";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../../components/DataTable/useQueryTable";
import { StatusPill } from "../../../../components/StatusPill/StatusPill";
import type { ShareAccessRule } from "../../../../lib/api/types/shares";
import { formatDateTime } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { denyAccess, shareAccessQuery, shareWriteKeys } from "../../api";
import { ruleStateTone, statusLabel } from "../../status";
import styles from "../../Shares.module.scss";

/**
 * A share's access rules, deleted one or several at a time. "Add rule"
 * calls `onAdd`, and is disabled while the share cannot take a rule.
 */
export function RulesTab({
  shareId,
  onAdd,
}: {
  shareId: string;
  onAdd: () => void;
}) {
  const projectId = useProjectId();
  const access = useQuery(shareAccessQuery(projectId, shareId));
  const accessTable = useQueryTable(access, {
    noun: "access rules",
    emptyTitle: "No access rules",
  });
  const deny = useBulkAction<ShareAccessRule, "delete">({
    noun: { one: "access rule", many: "access rules" },
    name: (rule) => rule.access_to ?? rule.id,
    getId: (rule) => rule.id,
    invalidates: shareWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (rule) => denyAccess(shareId, rule.id),
        title: (rules) => {
          const [only] = rules;
          return rules.length === 1 && only
            ? `Delete the rule for ${only.access_to}?`
            : `Delete ${rules.length} access rules?`;
        },
        body: <p>Clients using this rule lose access to the share.</p>,
      },
    },
  });
  const columns = useMemo<ColumnDef<ShareAccessRule>[]>(
    () => [
      {
        id: "to",
        label: "Access to",
        isRowHeader: true,
        cell: (row) => (
          <span className={styles.identifier}>{row.access_to}</span>
        ),
        sortValue: (row) => row.access_to ?? "",
      },
      {
        id: "type",
        label: "Type",
        cell: (row) => row.access_type ?? "",
        sortValue: (row) => row.access_type ?? "",
      },
      { id: "level", label: "Level", cell: (row) => row.access_level ?? "" },
      {
        id: "state",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={ruleStateTone(row.state)}>
            {statusLabel(row.state)}
          </StatusPill>
        ),
        sortValue: (row) => row.state ?? "",
      },
      {
        id: "key",
        label: "Access key",
        cell: (row) =>
          row.access_key ? (
            <span className={styles.identifier}>
              {row.access_key} <CopyButton text={row.access_key} />
            </span>
          ) : (
            ""
          ),
        hideBelow: "md",
      },
      {
        id: "created",
        label: "Created",
        cell: (row) => formatDateTime(row.created_at) || "",
        sortValue: (row) => row.created_at ?? "",
        hideBelow: "lg",
      },
    ],
    [],
  );
  return (
    <>
      <DataTable
        id="share-rules"
        label="Access rules"
        columns={columns}
        getRowId={(row) => row.id}
        {...accessTable}
        {...deny.tableProps}
        toolbarActions={
          <Button size="xs" onPress={onAdd} isDisabled={!access.data?.can_add}>
            Add rule
          </Button>
        }
        emptyBody={
          <p>Nothing can mount the share until a rule grants access.</p>
        }
        rowActions={(row) => [
          {
            id: "delete",
            label: "Delete rule",
            tone: "danger",
            onAction: () => deny.run("delete", [row]),
          },
        ]}
      />
      {deny.dialog}
    </>
  );
}
