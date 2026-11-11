// A template parameter's Heat `custom_constraint` as the form shows it: a
// choice from the project's own resources for the common constraints, as
// heat-dashboard offers (believed: the plugin is not checked out here; it
// is known to cover key pairs, flavours, images and networks, and Hive adds
// subnets and volumes), and a plain sentence instead of the raw name.
import type { Option } from "../../../components/Form/fields";

/** The constraints whose values the form offers from the project. */
export const SOURCED_CONSTRAINTS = [
  "nova.keypair",
  "nova.flavor",
  "glance.image",
  "neutron.network",
  "neutron.subnet",
  "cinder.volume",
] as const;

export type SourcedConstraint = (typeof SOURCED_CONSTRAINTS)[number];

/** Whether the form offers the constraint's values as a choice. */
export function isSourced(
  constraint: string | null,
): constraint is SourcedConstraint {
  return (SOURCED_CONSTRAINTS as readonly string[]).includes(constraint ?? "");
}

/** What each known constraint asks for, in words. */
const NOUNS: Readonly<Record<string, string>> = {
  "nova.keypair": "one of your key pairs",
  "nova.flavor": "a flavour",
  "glance.image": "an image",
  "neutron.network": "a network",
  "neutron.subnet": "a subnet",
  "cinder.volume": "one of your volumes",
  "cinder.snapshot": "one of your volume snapshots",
  "cinder.backup": "one of your volume backups",
  "cinder.vtype": "a volume type",
  "neutron.port": "a port",
  "neutron.router": "a router",
  "neutron.security_group": "a security group",
  "nova.server": "one of your instances",
  "nova.host": "a compute host",
  "nova.network": "a network",
};

/**
 * The help text for a parameter's constraint: "Must be one of your key
 * pairs." Heat checks a constraint it knows no words for itself, when the
 * stack launches, which the sentence says instead of naming it.
 */
export function constraintHint(constraint: string): string {
  const noun = NOUNS[constraint];
  return noun
    ? `Must be ${noun}`
    : "Heat checks this value when the stack launches";
}

/**
 * One resource offered for a constraint: its id (the value sent), its
 * name (which Heat also takes) and the label the option shows.
 */
export interface Choice {
  id: string;
  name: string;
  label: string;
}

/**
 * The options of a sourced parameter, keeping its current value (the
 * template's default) selectable. Heat takes a resource's name or id, so a
 * value that names an offered resource selects that resource under the
 * name; one the project does not list stays as its own option, marked as
 * the template's.
 */
export function constraintOptions(
  choices: readonly Choice[],
  current: string,
): Option[] {
  const options = choices.map((choice) => ({
    id: choice.id,
    label: choice.label,
  }));
  if (!current || options.some((o) => o.id === current)) return options;
  const named = choices.findIndex((choice) => choice.name === current);
  if (named >= 0) {
    return options.map((o, index) =>
      index === named ? { ...o, id: current } : o,
    );
  }
  return [...options, { id: current, label: `${current} (from the template)` }];
}
