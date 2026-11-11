// The launch wizard's steps in the order they run, each with the fields
// Next validates before moving on.
import type { FieldPath } from "react-hook-form";
import type { WizardSteps } from "../../../../components/Wizard/steps";
import type { LaunchForm } from "../launchForm";
import { ConfigStep } from "./ConfigStep";
import { DetailsStep } from "./DetailsStep";
import { FlavorStep } from "./FlavorStep";
import { KeyPairStep } from "./KeyPairStep";
import { NetworksStep } from "./NetworksStep";
import type { LaunchStepProps } from "./props";
import { SecurityStep } from "./SecurityStep";
import { SourceStep } from "./SourceStep";

/** The seven launch steps, keyed by step id. */
export const launchSteps = {
  details: {
    title: "Details",
    fields: ["name", "description", "availability_zone", "count"],
    Component: DetailsStep,
  },
  source: {
    title: "Source",
    fields: [
      "source_type",
      "source_id",
      "create_volume",
      "volume_size_gb",
      "volume_type",
      "delete_volume_on_termination",
    ],
    Component: SourceStep,
  },
  flavor: {
    title: "Flavour",
    fields: ["flavor_class", "flavor_id"],
    Component: FlavorStep,
  },
  networks: {
    title: "Networks",
    fields: ["networks", "ports"],
    Component: NetworksStep,
  },
  security: {
    title: "Security groups",
    fields: ["security_groups"],
    Component: SecurityStep,
  },
  keypair: { title: "Key pair", fields: ["key_name"], Component: KeyPairStep },
  config: {
    title: "Configuration",
    fields: ["user_data", "config_drive", "server_group_id", "metadata"],
    Component: ConfigStep,
  },
} satisfies WizardSteps<string, FieldPath<LaunchForm>, LaunchStepProps>;
