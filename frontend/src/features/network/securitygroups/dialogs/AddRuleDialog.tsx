// Add a rule to a security group, with Nectar's presets and no default
// remote CIDR.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button } from "@ardc-ui/react";
import { useWatch } from "react-hook-form";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { fieldsFor } from "../../../../components/Form/fields";
import type { SecurityGroup } from "../../../../lib/api/types/network";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import {
  myAddressQuery,
  rulePresetsQuery,
  securityGroupsQuery,
  useCreateRule,
} from "../../api";
import { ruleRequest } from "./request";
import { ruleSchema, type RuleForm } from "./schema";
import groups from "../../DialogGroups.module.scss";

const CUSTOM = [
  { id: "custom_tcp", label: "Custom TCP rule" },
  { id: "custom_udp", label: "Custom UDP rule" },
  { id: "custom_icmp", label: "Custom ICMP rule" },
  { id: "other", label: "Other protocol" },
];

const OPEN = new Set(["0.0.0.0/0", "::/0"]);

/**
 * The add rule dialog: a preset or custom rule, its direction, ether type,
 * ports and remote. The fields follow the kind chosen, a CIDR open to the
 * whole internet draws a warning, and "Use my address" fills in the
 * browser's own address alone (a /32, or a /128 with the ether type to
 * match), the narrow rule most users want for SSH.
 */
export function AddRuleDialog({
  group,
  onClose,
}: {
  group: SecurityGroup;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const presets = useQuery(rulePresetsQuery);
  const securityGroups = useQuery(securityGroupsQuery(projectId));
  const myAddress = useQuery(myAddressQuery);
  const mine = myAddress.data?.address ?? null;
  const mineVersion = myAddress.data?.ip_version ?? 4;
  // The remote CIDR starts from the deployment's default once the presets
  // load; a CIDR the user has already typed survives.
  const defaultCidr = presets.data?.default_remote_cidr ?? "";
  const initial = useMemo<RuleForm>(
    () => ({
      kind: "custom_tcp",
      direction: "ingress",
      ethertype: "IPv4",
      port_mode: "port",
      protocol: "",
      remote: "cidr",
      cidr: defaultCidr,
      remote_group_id: "",
      description: "",
    }),
    [defaultCidr],
  );
  const { NumberInput, RadioInput, SelectInput, TextInput } =
    fieldsFor<RuleForm>();
  const { form, dialog } = useMutationForm({
    schema: ruleSchema,
    values: initial,
    mutation: useCreateRule(),
    toVariables: (values) => ({ groupId: group.id, ...ruleRequest(values) }),
    successMessage: `Rule added to ${group.name}.`,
    onDone: onClose,
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  const portMode = useWatch({ control: form.control, name: "port_mode" });
  const remote = useWatch({ control: form.control, name: "remote" });
  const cidr = useWatch({ control: form.control, name: "cidr" });
  const isCustomPort = kind === "custom_tcp" || kind === "custom_udp";

  const kinds = [
    ...CUSTOM,
    ...(presets.data?.items ?? []).map((preset) => ({
      id: preset.id,
      label: `${preset.name}${preset.port ? ` (${preset.port})` : ""}`,
    })),
  ];

  return (
    <FormDialog
      {...dialog}
      title={`Add rule to ${group.name}`}
      submitLabel="Add rule"
      size="lg"
    >
      <SelectInput
        name="kind"
        label="Rule"
        options={kinds}
        isRequired
        description="Pick a common service, or a custom rule for a protocol and port range."
      />
      <RadioInput
        name="direction"
        label="Direction"
        options={[
          { id: "ingress", label: "Ingress (incoming)" },
          { id: "egress", label: "Egress (outgoing)" },
        ]}
      />
      <RadioInput
        name="ethertype"
        label="Ether type"
        options={[
          { id: "IPv4", label: "IPv4" },
          { id: "IPv6", label: "IPv6" },
        ]}
      />
      {isCustomPort && (
        <>
          <RadioInput
            name="port_mode"
            label="Ports"
            options={[
              { id: "port", label: "A single port" },
              { id: "range", label: "A range of ports" },
              { id: "all", label: "All ports" },
            ]}
          />
          {portMode === "port" && (
            <NumberInput
              name="port"
              label="Port"
              minValue={1}
              maxValue={65535}
              isRequired
            />
          )}
          {portMode === "range" && (
            <>
              <NumberInput
                name="port_from"
                label="From port"
                minValue={1}
                maxValue={65535}
                isRequired
              />
              <NumberInput
                name="port_to"
                label="To port"
                minValue={1}
                maxValue={65535}
                isRequired
              />
            </>
          )}
        </>
      )}
      {kind === "custom_icmp" && (
        <>
          <NumberInput
            name="icmp_type"
            label="ICMP type"
            minValue={-1}
            maxValue={255}
            description="Leave empty for all types."
          />
          <NumberInput
            name="icmp_code"
            label="ICMP code"
            minValue={-1}
            maxValue={255}
            description="Leave empty for all codes of the type. A code needs a type."
          />
        </>
      )}
      {kind === "other" && (
        <TextInput
          name="protocol"
          label="Protocol"
          description="An IP protocol name (for example gre) or number."
          isRequired
        />
      )}
      <RadioInput
        name="remote"
        label="Remote"
        options={[
          { id: "cidr", label: "CIDR (an address range)" },
          { id: "group", label: "Security group" },
        ]}
      />
      {remote === "cidr" ? (
        <TextInput
          name="cidr"
          label="CIDR"
          description="The addresses the rule applies to. There is no default: 0.0.0.0/0 opens the port to the whole internet."
          placeholder="203.0.113.0/24"
          isRequired
        />
      ) : (
        <SelectInput
          name="remote_group_id"
          label="Remote security group"
          options={(securityGroups.data?.items ?? []).map((g) => ({
            id: g.id,
            label: g.name,
          }))}
          isRequired
          isDisabled={securityGroups.isPending}
          placeholder={
            securityGroups.isPending ? "Loading..." : "Choose a group"
          }
        />
      )}
      {remote === "cidr" && mine && (
        <div className={groups.actions}>
          <Button
            variant="secondary"
            size="xs"
            onPress={() => {
              const options = { shouldDirty: true, shouldValidate: true };
              form.setValue(
                "ethertype",
                mineVersion === 6 ? "IPv6" : "IPv4",
                options,
              );
              form.setValue(
                "cidr",
                `${mine}/${mineVersion === 6 ? 128 : 32}`,
                options,
              );
            }}
          >
            {`Use my address (${mine})`}
          </Button>
        </div>
      )}
      {remote === "cidr" && OPEN.has(cidr.trim()) && (
        <Alert tone="warning" role="status">
          This rule opens the port to every address on the internet. Narrow the
          CIDR to the networks that need access where you can.
        </Alert>
      )}
      <TextInput name="description" label="Description" />
    </FormDialog>
  );
}
