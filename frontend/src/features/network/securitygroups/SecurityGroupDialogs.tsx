// Create and edit dialogs for security groups, and the add-rule dialog
// with Nectar's presets and no default remote CIDR.
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@ardc-ui/react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import {
  NumberInput,
  RadioInput,
  SelectInput,
  TextInput,
} from "../../../components/Form/fields";
import type { SecurityGroup } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import {
  rulePresetsQuery,
  securityGroupsQuery,
  useCreateRule,
  useCreateSecurityGroup,
  useUpdateSecurityGroup,
} from "../api";
import { ruleSchema, toRuleRequest, type RuleForm } from "./rules";

const groupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name")
    .max(255, "At most 255 characters"),
  description: z.string().trim().max(255, "At most 255 characters"),
});

export function CreateSecurityGroupDialog({
  projectId,
  isOpen,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (group: SecurityGroup) => void;
}) {
  const create = useCreateSecurityGroup(projectId);
  const form = useForm<z.infer<typeof groupSchema>>({
    resolver: zodResolver(groupSchema),
    defaultValues: { name: "", description: "" },
  });
  const submit = form.handleSubmit((values) => {
    create.mutate(values, {
      onSuccess: (group) => {
        notify.success(`Security group ${group.name} created.`);
        form.reset();
        onOpenChange(false);
        onCreated?.(group);
      },
    });
  });
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) form.reset();
        onOpenChange(open);
      }}
      title="Create security group"
      submitLabel="Create security group"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <p>
        A new group allows all outbound traffic and no inbound traffic. Add
        rules to it afterwards.
      </p>
      <TextInput control={form.control} name="name" label="Name" isRequired />
      <TextInput
        control={form.control}
        name="description"
        label="Description"
      />
    </FormDialog>
  );
}

export function EditSecurityGroupDialog({
  projectId,
  group,
  onClose,
}: {
  projectId: string;
  group: SecurityGroup;
  onClose: () => void;
}) {
  const update = useUpdateSecurityGroup(projectId);
  const form = useForm<z.infer<typeof groupSchema>>({
    resolver: zodResolver(groupSchema),
    defaultValues: { name: group.name, description: group.description },
  });
  const submit = form.handleSubmit((values) => {
    update.mutate(
      { groupId: group.id, ...values },
      {
        onSuccess: () => {
          notify.success(`Security group ${values.name} updated.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Edit security group ${group.name}`}
      submitLabel="Save"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
    >
      <TextInput control={form.control} name="name" label="Name" isRequired />
      <TextInput
        control={form.control}
        name="description"
        label="Description"
      />
    </FormDialog>
  );
}

// --- rules ----------------------------------------------------------------------

const CUSTOM = [
  { id: "custom_tcp", label: "Custom TCP rule" },
  { id: "custom_udp", label: "Custom UDP rule" },
  { id: "custom_icmp", label: "Custom ICMP rule" },
  { id: "other", label: "Other protocol" },
];

const OPEN = new Set(["0.0.0.0/0", "::/0"]);

export function AddRuleDialog({
  projectId,
  group,
  onClose,
}: {
  projectId: string;
  group: SecurityGroup;
  onClose: () => void;
}) {
  const presets = useQuery(rulePresetsQuery);
  const groups = useQuery(securityGroupsQuery(projectId));
  const create = useCreateRule(projectId);
  const form = useForm<RuleForm>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      kind: "custom_tcp",
      direction: "ingress",
      ethertype: "IPv4",
      port_mode: "port",
      protocol: "",
      remote: "cidr",
      cidr: presets.data?.default_remote_cidr ?? "",
      remote_group_id: "",
      description: "",
    },
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

  const submit = form.handleSubmit((values) => {
    create.mutate(
      { groupId: group.id, ...toRuleRequest(values) },
      {
        onSuccess: () => {
          notify.success(`Rule added to ${group.name}.`);
          onClose();
        },
      },
    );
  });

  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Add rule to ${group.name}`}
      submitLabel="Add rule"
      size="lg"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <SelectInput
        control={form.control}
        name="kind"
        label="Rule"
        options={kinds}
        isRequired
        description="Pick a common service, or a custom rule for a protocol and port range."
      />
      <RadioInput
        control={form.control}
        name="direction"
        label="Direction"
        options={[
          { id: "ingress", label: "Ingress (incoming)" },
          { id: "egress", label: "Egress (outgoing)" },
        ]}
      />
      {isCustomPort && (
        <>
          <RadioInput
            control={form.control}
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
              control={form.control}
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
                control={form.control}
                name="port_from"
                label="From port"
                minValue={1}
                maxValue={65535}
                isRequired
              />
              <NumberInput
                control={form.control}
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
            control={form.control}
            name="icmp_type"
            label="ICMP type"
            minValue={-1}
            maxValue={255}
            description="Leave empty for all types."
          />
          <NumberInput
            control={form.control}
            name="icmp_code"
            label="ICMP code"
            minValue={-1}
            maxValue={255}
            description="Leave empty for all codes. A code needs a type."
          />
        </>
      )}
      {kind === "other" && (
        <TextInput
          control={form.control}
          name="protocol"
          label="Protocol"
          description="An IP protocol name (for example gre) or number."
          isRequired
        />
      )}
      <RadioInput
        control={form.control}
        name="remote"
        label="Remote"
        options={[
          { id: "cidr", label: "CIDR (an address range)" },
          { id: "group", label: "Security group" },
        ]}
      />
      {remote === "cidr" ? (
        <TextInput
          control={form.control}
          name="cidr"
          label="CIDR"
          description="The IPv4 or IPv6 addresses the rule applies to. There is no default: 0.0.0.0/0 opens the port to the whole internet."
          placeholder="203.0.113.0/24"
          isRequired
        />
      ) : (
        <SelectInput
          control={form.control}
          name="remote_group_id"
          label="Remote security group"
          options={(groups.data?.items ?? []).map((g) => ({
            id: g.id,
            label: g.name,
          }))}
          isRequired
          isDisabled={groups.isPending}
          placeholder={groups.isPending ? "Loading..." : "Choose a group"}
        />
      )}
      {remote === "group" && (
        <RadioInput
          control={form.control}
          name="ethertype"
          label="Ether type"
          description="With a CIDR the ether type follows the address."
          options={[
            { id: "IPv4", label: "IPv4" },
            { id: "IPv6", label: "IPv6" },
          ]}
        />
      )}
      {remote === "cidr" && OPEN.has(cidr.trim()) && (
        <Alert tone="warning" role="status">
          This rule opens the port to every address on the internet. Narrow the
          CIDR to the networks that need access where you can.
        </Alert>
      )}
      <TextInput
        control={form.control}
        name="description"
        label="Description"
      />
    </FormDialog>
  );
}
