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
import type { RuleCreate, SecurityGroup } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import {
  rulePresetsQuery,
  securityGroupsQuery,
  useCreateRule,
  useCreateSecurityGroup,
  useUpdateSecurityGroup,
} from "../api";

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

const IPV4_CIDR = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
const IPV6_CIDR = /^[0-9a-fA-F:]+\/\d{1,3}$/;
const OPEN = new Set(["0.0.0.0/0", "::/0"]);

const ruleSchema = z
  .object({
    kind: z.string().min(1, "Choose a rule"),
    direction: z.enum(["ingress", "egress"]),
    ethertype: z.enum(["IPv4", "IPv6"]),
    port_mode: z.enum(["all", "port", "range"]),
    port: z.number().int().min(1).max(65535).optional(),
    port_from: z.number().int().min(1).max(65535).optional(),
    port_to: z.number().int().min(1).max(65535).optional(),
    icmp_type: z.number().int().min(-1).max(255).optional(),
    icmp_code: z.number().int().min(-1).max(255).optional(),
    protocol: z.string().trim().max(32),
    remote: z.enum(["cidr", "group"]),
    cidr: z.string().trim(),
    remote_group_id: z.string(),
    description: z.string().trim().max(255, "At most 255 characters"),
  })
  .superRefine((value, ctx) => {
    const custom = value.kind === "custom_tcp" || value.kind === "custom_udp";
    if (custom && value.port_mode === "port" && value.port === undefined) {
      ctx.addIssue({ code: "custom", path: ["port"], message: "Enter a port" });
    }
    if (custom && value.port_mode === "range") {
      if (value.port_from === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["port_from"],
          message: "Enter the first port",
        });
      }
      if (value.port_to === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["port_to"],
          message: "Enter the last port",
        });
      }
      if (
        value.port_from !== undefined &&
        value.port_to !== undefined &&
        value.port_from > value.port_to
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["port_to"],
          message: "Must not be lower than the first port",
        });
      }
    }
    if (value.kind === "other" && !value.protocol) {
      ctx.addIssue({
        code: "custom",
        path: ["protocol"],
        message: "Enter a protocol name or number",
      });
    }
    if (value.remote === "cidr") {
      if (!value.cidr) {
        ctx.addIssue({
          code: "custom",
          path: ["cidr"],
          message: "Enter a CIDR, for example 203.0.113.0/24",
        });
      } else if (value.ethertype === "IPv4" && !IPV4_CIDR.test(value.cidr)) {
        ctx.addIssue({
          code: "custom",
          path: ["cidr"],
          message: "Enter an IPv4 CIDR, for example 203.0.113.0/24",
        });
      } else if (value.ethertype === "IPv6" && !IPV6_CIDR.test(value.cidr)) {
        ctx.addIssue({
          code: "custom",
          path: ["cidr"],
          message: "Enter an IPv6 CIDR, for example 2001:db8::/32",
        });
      }
    } else if (!value.remote_group_id) {
      ctx.addIssue({
        code: "custom",
        path: ["remote_group_id"],
        message: "Choose a security group",
      });
    }
  });

type RuleForm = z.infer<typeof ruleSchema>;

function toRequest(values: RuleForm): RuleCreate {
  const request: RuleCreate = {
    direction: values.direction,
    ethertype: values.ethertype,
    description: values.description,
  };
  if (values.kind.startsWith("custom_")) {
    request.protocol = values.kind.replace("custom_", "");
    if (request.protocol === "icmp") {
      if (values.ethertype === "IPv6") request.protocol = "ipv6-icmp";
      if (values.icmp_type !== undefined && values.icmp_type >= 0) {
        request.port_range_min = values.icmp_type;
        request.port_range_max =
          values.icmp_code !== undefined && values.icmp_code >= 0
            ? values.icmp_code
            : -1;
      }
    } else if (values.port_mode === "port") {
      request.port_range_min = values.port ?? null;
      request.port_range_max = values.port ?? null;
    } else if (values.port_mode === "range") {
      request.port_range_min = values.port_from ?? null;
      request.port_range_max = values.port_to ?? null;
    }
  } else if (values.kind === "other") {
    request.protocol = values.protocol;
  } else {
    request.preset = values.kind;
  }
  if (values.remote === "cidr") {
    request.remote_ip_prefix = values.cidr;
  } else {
    request.remote_group_id = values.remote_group_id;
  }
  return request;
}

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
      { groupId: group.id, ...toRequest(values) },
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
      <RadioInput
        control={form.control}
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
            description="Leave empty (or -1) for all types."
          />
          <NumberInput
            control={form.control}
            name="icmp_code"
            label="ICMP code"
            minValue={-1}
            maxValue={255}
            description="Leave empty (or -1) for all codes."
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
          description="The addresses the rule applies to. There is no default: 0.0.0.0/0 opens the port to the whole internet."
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
