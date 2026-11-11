// The launch wizard's security groups step.
import { useMemo, useState } from "react";
import { SearchField } from "@ardc-ui/react";
import { fieldsFor } from "../../../../components/Form/fields";
import type { Option } from "../../../../components/Form/fields/props";
import type { LaunchOptions } from "../../../../lib/api/types/compute";
import type { LaunchForm } from "../launchForm";
import styles from "../LaunchPage.module.scss";
import { SecurityGroupRules } from "./SecurityGroupRules";
import { filterGroups, offersGroupSearch } from "./securityRules";

const { CheckboxesInput } = fieldsFor<LaunchForm>();

/**
 * The project's security groups by name, each with its description and its
 * rules behind "Rules (n)", as Horizon's launch dialog lists them. A long
 * list (more than ten) gets a search over names and descriptions; a group
 * the search hides stays selected.
 */
export function SecurityStep({ data }: { data: LaunchOptions }) {
  const [query, setQuery] = useState("");
  const all = useMemo(() => data.security_groups ?? [], [data]);
  const byName = useMemo(
    () => new Map(all.map((group) => [group.name, group])),
    [all],
  );
  const groupNames = useMemo(
    () => new Map(all.map((group) => [group.id, group.name])),
    [all],
  );
  const shown = filterGroups(all, query);
  const options: Option[] = shown.map((group) => ({
    id: group.name,
    label: group.description
      ? `${group.name}: ${group.description}`
      : group.name,
  }));
  const details = (option: Option) => {
    const group = byName.get(option.id);
    return group ? (
      <SecurityGroupRules group={group} groupNames={groupNames} />
    ) : null;
  };
  return (
    <div className={styles.fields}>
      {offersGroupSearch(all.length) && (
        <SearchField
          size="sm"
          aria-label="Search security groups"
          placeholder="Search by name or description"
          value={query}
          onChange={setQuery}
        />
      )}
      <CheckboxesInput
        name="security_groups"
        label="Security groups"
        description="Firewall rules applied to the instance's interfaces. The default group allows outbound traffic only."
        options={options}
        details={details}
      />
      {shown.length === 0 && all.length > 0 && (
        <p className={styles.hint}>No security groups match the search.</p>
      )}
    </div>
  );
}
