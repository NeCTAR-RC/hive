// The dialog that lists an L7 policy's rules, edits and deletes them, and
// opens the add rule dialog.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ardc-ui/react";
import { DELETE } from "../../../../components/BulkAction/messages";
import { useBulkAction } from "../../../../components/BulkAction/useBulkAction";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import { DialogFrame } from "../../../../components/Dialog/DialogFrame";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import { StatusPill } from "../../../../components/StatusPill/StatusPill";
import { toRowActions } from "../../../../lib/actions";
import type { L7Policy, L7Rule } from "../../../../lib/api/types/loadbalancers";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { humanise } from "../../../../lib/status";
import { deleteL7Rule, l7PolicyQuery, loadBalancerWriteKeys } from "../../api";
import {
  availableRuleActions,
  octaviaLock,
  provisioningLabel,
  provisioningTone,
} from "../../status";
import { L7RuleDialog } from "./L7RuleDialog";

const idOf = (item: { id: string }) => item.id;

/** The rule dialog this list has swapped itself for, if any. */
type RuleDialog = { rule: L7Rule | null } | null;

/**
 * The rules of `policy` with their status, read fresh from its detail,
 * which polls while a rule is being applied. "Add rule" and a rule's
 * "Edit rule" swap this dialog for the rule dialog, which closes back to
 * this list. Changes wait while the load balancer (`lbStatus`) or the rule
 * is PENDING_*; the list itself only closes.
 */
export function PolicyRulesDialog({
  policy,
  lbStatus,
  onClose,
}: {
  policy: L7Policy;
  lbStatus: string | null;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const detail = useQuery(l7PolicyQuery(projectId, policy.id));
  const [ruleDialog, setRuleDialog] = useState<RuleDialog>(null);
  const remove = useBulkAction<L7Rule, "delete">({
    noun: { one: "rule", many: "rules" },
    name: (rule) => rule.value,
    getId: idOf,
    invalidates: loadBalancerWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (rule) => deleteL7Rule(policy.id, rule.id),
        title: (rules) =>
          rules.length === 1
            ? "Delete this rule?"
            : `Delete ${rules.length} rules?`,
      },
    },
  });
  const columns = useMemo<ColumnDef<L7Rule>[]>(
    () => [
      {
        id: "type",
        label: "Type",
        isRowHeader: true,
        cell: (row) => humanise(row.type),
      },
      {
        id: "compare",
        label: "Comparison",
        cell: (row) => humanise(row.compare_type),
      },
      { id: "key", label: "Key", cell: (row) => row.key ?? "" },
      { id: "value", label: "Value", cell: (row) => <code>{row.value}</code> },
      {
        id: "invert",
        label: "Inverted",
        cell: (row) => (row.invert ? "Yes" : "No"),
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={provisioningTone(row.provisioning_status)}>
            {provisioningLabel(row.provisioning_status)}
          </StatusPill>
        ),
      },
    ],
    [],
  );
  if (ruleDialog) {
    return (
      <L7RuleDialog
        policy={policy}
        rule={ruleDialog.rule}
        onClose={() => setRuleDialog(null)}
      />
    );
  }
  return (
    <DialogFrame
      onClose={onClose}
      isPending={false}
      title={`Rules of ${policy.name || policy.id}`}
      size="lg"
      actions={
        <>
          <Button variant="secondary" slot="close">
            Close
          </Button>
          <Button
            onPress={() => setRuleDialog({ rule: null })}
            isDisabled={octaviaLock(lbStatus) !== null}
          >
            Add rule
          </Button>
        </>
      }
    >
      {detail.isPending ? (
        <SkeletonLines lines={3} />
      ) : (
        <DataTable
          id="l7rules"
          label="L7 rules"
          columns={columns}
          rows={detail.data?.rule_rows ?? []}
          getRowId={idOf}
          {...remove.tableProps}
          isLoading={detail.isPending}
          error={detail.error}
          emptyTitle="No rules yet"
          rowActions={(row) =>
            toRowActions(availableRuleActions(row, lbStatus), (id) =>
              id === "edit"
                ? setRuleDialog({ rule: row })
                : remove.run("delete", [row]),
            )
          }
        />
      )}
      {remove.dialog}
    </DialogFrame>
  );
}
