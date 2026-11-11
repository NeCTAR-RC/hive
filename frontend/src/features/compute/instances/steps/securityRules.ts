// What the launch wizard's security groups step shows of each group: the
// groups a search leaves, and the title and columns of a group's rules.
import {
  containsWords,
  queryWords,
} from "../../../../components/DataTable/filter";
import type { SecurityGroup } from "../../../../lib/api/types/network";

/**
 * Above this many groups the step offers a search. Horizon's launch dialog
 * pages its groups at 20 with a filter; a short list needs neither.
 */
export const GROUP_SEARCH_THRESHOLD = 10;

/**
 * The rule columns the step shows, the ones Horizon's launch dialog lists
 * (its minimum and maximum port read as one port range here, as on the
 * group's own page), by their ids in `useRuleColumns`.
 */
export const STEP_RULE_COLUMNS: readonly string[] = [
  "direction",
  "ethertype",
  "protocol",
  "ports",
  "remote",
];

/** Whether a project with `count` groups gets the search field. */
export function offersGroupSearch(count: number): boolean {
  return count > GROUP_SEARCH_THRESHOLD;
}

/** The groups whose name or description holds every word of `query`. */
export function filterGroups<
  G extends Pick<SecurityGroup, "name" | "description">,
>(groups: readonly G[], query: string): G[] {
  const words = queryWords(query);
  if (words.length === 0) return [...groups];
  return groups.filter((group) =>
    containsWords(`${group.name} ${group.description}`, words),
  );
}

/** "Rules (3)": the title of a group's rules disclosure. */
export function rulesTitle(ruleCount: number): string {
  return `Rules (${ruleCount})`;
}
