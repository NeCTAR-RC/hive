// One security group's rules in the launch wizard, behind a disclosure.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Cell,
  Column,
  Loading,
  Minus,
  Plus,
  Row,
  Table,
  TableBody,
  TableHeader,
} from "@ardc-ui/react";
import {
  Button as AriaButton,
  Disclosure,
  DisclosurePanel,
} from "react-aria-components";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import type { SecurityGroup } from "../../../../lib/api/types/network";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { securityGroupQuery } from "../../../network/api";
import { useRuleColumns } from "../../../network/securitygroups/useRuleColumns";
import { STEP_RULE_COLUMNS, rulesTitle } from "./securityRules";
import styles from "./SecurityGroupRules.module.scss";

/**
 * "Rules (n)" under a group's checkbox: a React Aria `Disclosure` drawn as
 * the reservation chart's flavour rows draw theirs (the accordion's plus and
 * minus), which loads the group on first opening and lists its rules. The
 * trigger's accessible name adds the group's name, since every group has
 * one.
 */
export function SecurityGroupRules({
  group,
  groupNames,
}: {
  group: SecurityGroup;
  /** Every group's name by id, for a rule whose remote is a group. */
  groupNames: ReadonlyMap<string, string>;
}) {
  return (
    <Disclosure>
      {({ isExpanded }) => (
        <>
          <AriaButton slot="trigger" className={styles.toggle}>
            <span>
              {rulesTitle(group.rule_count)}
              <span className="visually-hidden"> in {group.name}</span>
            </span>
            <span className={styles.icon} aria-hidden="true">
              {isExpanded ? <Minus /> : <Plus />}
            </span>
          </AriaButton>
          <DisclosurePanel className={styles.panel}>
            {isExpanded && <RulesTable group={group} groupNames={groupNames} />}
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  );
}

/**
 * The group's rules in the library `Table`, in the columns Horizon's launch
 * dialog shows, drawn by the group page's own column definitions. The table's
 * empty cell says "Loading rules..." until they arrive; a failure is the
 * shared `ErrorState` with "Try again".
 */
function RulesTable({
  group,
  groupNames,
}: {
  group: SecurityGroup;
  groupNames: ReadonlyMap<string, string>;
}) {
  const projectId = useProjectId();
  const detail = useQuery(securityGroupQuery(projectId, group.id));
  const allColumns = useRuleColumns(groupNames);
  const columns = useMemo(
    () => allColumns.filter((column) => STEP_RULE_COLUMNS.includes(column.id)),
    [allColumns],
  );

  if (detail.isError) {
    return (
      <ErrorState
        error={detail.error}
        title="Could not load the rules"
        onRetry={() => void detail.refetch()}
      />
    );
  }
  return (
    <Table aria-label={`Rules in ${group.name}`}>
      <TableHeader columns={columns}>
        {(column) => (
          <Column id={column.id} isRowHeader={column.isRowHeader}>
            {column.label}
          </Column>
        )}
      </TableHeader>
      <TableBody
        items={detail.data?.rules ?? []}
        renderEmptyState={() =>
          detail.isPending ? (
            <Loading>Loading rules...</Loading>
          ) : (
            <p>No rules</p>
          )
        }
      >
        {(rule) => (
          <Row id={rule.id} columns={columns}>
            {(column) => <Cell>{column.cell(rule)}</Cell>}
          </Row>
        )}
      </TableBody>
    </Table>
  );
}
