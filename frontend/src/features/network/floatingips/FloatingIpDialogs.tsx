// The dialogs behind the Floating IPs panel: allocate an IP from a pool
// (Horizon's floating_ips/forms.py), associate an IP with a port
// (floating_ips/workflows.py, also reached from an instance's menu), and
// add or edit a port forwarding rule (floating_ip_portforwardings).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert } from "@ardc-ui/react";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import {
  SelectInput,
  TextAreaInput,
  TextInput,
} from "../../../components/Form/fields";
import type {
  FloatingIp,
  FloatingIpAllocateRequest,
  PortForwarding,
  PortForwardingRequest,
} from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import {
  floatingIpTargetsQuery,
  floatingIpsQuery,
  networkOptionsQuery,
  useAllocateFloatingIp,
  useAssociateFloatingIp,
  useCreatePortForwarding,
  useUpdatePortForwarding,
} from "../api";
import { quotaLeft } from "../status";
import { parseIp } from "../networks/subnetRules";

const NAME = z.string().trim().max(255, "At most 255 characters");

// --- allocate ----------------------------------------------------------------

const allocateSchema = z
  .object({
    floating_network_id: z.string().min(1, "Choose a pool"),
    floating_ip_address: z.string().trim(),
    description: NAME,
    dns_domain: NAME,
    dns_name: NAME,
  })
  .superRefine((values, ctx) => {
    if (values.floating_ip_address && !parseIp(values.floating_ip_address)) {
      ctx.addIssue({
        code: "custom",
        path: ["floating_ip_address"],
        message: "Enter an IP address",
      });
    }
  });

export function AllocateFloatingIpDialog({
  projectId,
  isOpen,
  onOpenChange,
}: {
  projectId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const options = useQuery({
    ...networkOptionsQuery(projectId),
    enabled: isOpen,
  });
  const allocate = useAllocateFloatingIp(projectId);
  const pools = options.data?.floating_networks ?? [];
  const form = useForm<z.infer<typeof allocateSchema>>({
    resolver: zodResolver(allocateSchema),
    defaultValues: {
      floating_network_id: "",
      floating_ip_address: "",
      description: "",
      dns_domain: "",
      dns_name: "",
    },
  });
  // With a single pool there is nothing to choose; pick it.
  if (
    pools.length === 1 &&
    pools[0] &&
    form.getValues("floating_network_id") === "" &&
    !form.formState.dirtyFields.floating_network_id
  ) {
    form.setValue("floating_network_id", pools[0].id);
  }
  const dns = options.data?.extensions?.dns_integration ?? false;
  const quotaFull = !quotaLeft(options.data?.quota, "floatingip");
  const reset = () => {
    form.reset();
    allocate.reset();
  };
  const submit = form.handleSubmit((values) => {
    const body: FloatingIpAllocateRequest = {
      floating_network_id: values.floating_network_id,
    };
    if (values.floating_ip_address) {
      body.floating_ip_address = values.floating_ip_address;
    }
    if (values.description) body.description = values.description;
    if (dns && values.dns_domain) body.dns_domain = values.dns_domain;
    if (dns && values.dns_name) body.dns_name = values.dns_name;
    allocate.mutate(body, {
      onSuccess: (fip) => {
        notify.success(`Allocated floating IP ${fip.floating_ip_address}.`);
        reset();
        onOpenChange(false);
      },
    });
  });
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
      title="Allocate floating IP"
      submitLabel="Allocate IP"
      onSubmit={submit}
      isPending={allocate.isPending}
      error={allocate.error ?? options.error}
    >
      {quotaFull && (
        <Alert tone="warning" title="Quota exceeded">
          You are already using all of your available floating IPs.
        </Alert>
      )}
      <SelectInput
        control={form.control}
        name="floating_network_id"
        label="Pool"
        options={pools.map((p) => ({ id: p.id, label: p.name }))}
        isRequired
        isDisabled={options.isPending || pools.length === 0}
        placeholder={
          options.isPending
            ? "Loading pools..."
            : pools.length === 0
              ? "No floating IP pools are available"
              : "Choose a pool"
        }
      />
      <TextInput
        control={form.control}
        name="floating_ip_address"
        label="Floating IP address (optional)"
        description="A specific address inside the pool's range. Leave blank to be given the next free one."
      />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
        rows={2}
      />
      {dns && (
        <>
          <TextInput control={form.control} name="dns_name" label="DNS name" />
          <TextInput
            control={form.control}
            name="dns_domain"
            label="DNS domain"
          />
        </>
      )}
    </FormDialog>
  );
}

// --- associate ---------------------------------------------------------------

const associateSchema = z.object({
  floating_ip_id: z.string().min(1, "Choose a floating IP"),
  target_id: z.string().min(1, "Choose a port"),
});

/**
 * Pick a free floating IP and a port address to bind it to. From the
 * Floating IPs panel the IP is fixed and the target list covers every
 * instance; from an instance's menu the targets are that instance's ports
 * and any free IP can be chosen.
 */
export function AssociateFloatingIpDialog({
  projectId,
  floatingIp,
  instance,
  onClose,
}: {
  projectId: string;
  floatingIp?: FloatingIp | undefined;
  instance?: { id: string; name: string } | undefined;
  onClose: () => void;
}) {
  const fips = useQuery({
    ...floatingIpsQuery(projectId),
    enabled: floatingIp === undefined,
  });
  const targets = useQuery(floatingIpTargetsQuery(projectId, instance?.id));
  const associate = useAssociateFloatingIp(projectId);
  const form = useForm<z.infer<typeof associateSchema>>({
    resolver: zodResolver(associateSchema),
    defaultValues: { floating_ip_id: floatingIp?.id ?? "", target_id: "" },
  });
  const freeIps = useMemo(
    () =>
      (fips.data?.items ?? [])
        .filter((f) => !f.port_id && f.port_forwarding_count === 0)
        .sort((a, b) =>
          (a.floating_ip_address ?? "").localeCompare(
            b.floating_ip_address ?? "",
            "en-AU",
            { numeric: true },
          ),
        ),
    [fips.data],
  );
  const items = targets.data?.items ?? [];
  // One instance port and one IP need no choosing; preselect them.
  if (
    items.length === 1 &&
    items[0] &&
    form.getValues("target_id") === "" &&
    !form.formState.dirtyFields.target_id
  ) {
    form.setValue("target_id", items[0].id);
  }
  const submit = form.handleSubmit((values) => {
    const target = items.find((t) => t.id === values.target_id);
    if (!target) return;
    const ip =
      floatingIp ?? freeIps.find((f) => f.id === values.floating_ip_id);
    associate.mutate(
      {
        floatingIpId: values.floating_ip_id,
        portId: target.port_id,
        fixedIp: target.ip_address,
      },
      {
        onSuccess: () => {
          notify.success(
            `Floating IP ${ip?.floating_ip_address ?? ""} associated with ${target.name}.`.replace(
              "  ",
              " ",
            ),
          );
          onClose();
        },
      },
    );
  });
  const title = floatingIp
    ? `Associate ${floatingIp.floating_ip_address}`
    : instance
      ? `Associate a floating IP with ${instance.name}`
      : "Associate floating IP";
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={title}
      submitLabel="Associate"
      onSubmit={submit}
      isPending={associate.isPending}
      error={associate.error ?? targets.error ?? fips.error}
    >
      {!floatingIp && (
        <SelectInput
          control={form.control}
          name="floating_ip_id"
          label="Floating IP"
          options={freeIps.map((f) => ({
            id: f.id,
            label: `${f.floating_ip_address}${f.pool_name ? ` (${f.pool_name})` : ""}`,
          }))}
          isRequired
          isDisabled={fips.isPending || freeIps.length === 0}
          placeholder={
            fips.isPending
              ? "Loading floating IPs..."
              : freeIps.length === 0
                ? "No free floating IPs; allocate one first"
                : "Choose a floating IP"
          }
        />
      )}
      <SelectInput
        control={form.control}
        name="target_id"
        label="Port to associate"
        options={items.map((t) => ({ id: t.id, label: t.name }))}
        isRequired
        isDisabled={targets.isPending || items.length === 0}
        placeholder={
          targets.isPending
            ? "Loading ports..."
            : items.length === 0
              ? "No reachable ports"
              : "Choose a port"
        }
        description="Only addresses behind a router with a gateway to the floating network are listed."
      />
    </FormDialog>
  );
}

// --- port forwarding rule ----------------------------------------------------

const PORT_RANGE = /^(\d{1,5})(:(\d{1,5}))?$/;

function checkPorts(value: string): string | null {
  const match = PORT_RANGE.exec(value.trim());
  if (!match) return "Enter a port, or a range as start:end";
  const low = Number(match[1]);
  const high = match[3] === undefined ? low : Number(match[3]);
  if (low < 1 || high > 65535) return "Ports run from 1 to 65535";
  if (low > high) return "The range start must not be after its end";
  return null;
}

const ruleSchema = z
  .object({
    protocol: z.enum(["tcp", "udp"]),
    target_id: z.string().min(1, "Choose an internal address"),
    internal_port: z.string().trim().min(1, "Enter the internal port"),
    external_port: z.string().trim().min(1, "Enter the external port"),
    description: NAME,
  })
  .superRefine((values, ctx) => {
    for (const key of ["internal_port", "external_port"] as const) {
      const problem = checkPorts(values[key]);
      if (problem)
        ctx.addIssue({ code: "custom", path: [key], message: problem });
    }
  });

export function PortForwardingDialog({
  projectId,
  floatingIp,
  rule,
  onClose,
}: {
  projectId: string;
  floatingIp: Pick<FloatingIp, "id" | "floating_ip_address">;
  /** Present when editing. */
  rule?: PortForwarding | undefined;
  onClose: () => void;
}) {
  const targets = useQuery(floatingIpTargetsQuery(projectId));
  const create = useCreatePortForwarding(projectId);
  const update = useUpdatePortForwarding(projectId);
  const form = useForm<z.infer<typeof ruleSchema>>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      protocol: rule?.protocol === "udp" ? "udp" : "tcp",
      target_id: rule
        ? `${rule.internal_port_id}_${rule.internal_ip_address}`
        : "",
      internal_port: rule?.internal_port ?? "",
      external_port: rule?.external_port ?? "",
      description: rule?.description ?? "",
    },
  });
  const items = targets.data?.items ?? [];
  const submit = form.handleSubmit((values) => {
    const target = items.find((t) => t.id === values.target_id);
    if (!target) return;
    const body: PortForwardingRequest = {
      protocol: values.protocol,
      internal_port_id: target.port_id,
      internal_ip_address: target.ip_address,
      internal_port: values.internal_port,
      external_port: values.external_port,
    };
    if (values.description) body.description = values.description;
    const done = () => {
      notify.success(
        `${rule ? "Updated" : "Added"} the ${values.protocol.toUpperCase()} rule for port ${values.external_port} on ${floatingIp.floating_ip_address}. It can take a few minutes to apply.`,
      );
      onClose();
    };
    if (rule) {
      update.mutate(
        { floatingIpId: floatingIp.id, ruleId: rule.id, ...body },
        { onSuccess: done },
      );
    } else {
      create.mutate(
        { floatingIpId: floatingIp.id, ...body },
        { onSuccess: done },
      );
    }
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={
        rule
          ? `Edit port forwarding rule on ${floatingIp.floating_ip_address}`
          : `Add port forwarding rule on ${floatingIp.floating_ip_address}`
      }
      submitLabel={rule ? "Save" : "Add rule"}
      onSubmit={submit}
      isPending={create.isPending || update.isPending}
      error={create.error ?? update.error ?? targets.error}
    >
      <SelectInput
        control={form.control}
        name="protocol"
        label="Protocol"
        options={[
          { id: "tcp", label: "TCP" },
          { id: "udp", label: "UDP" },
        ]}
        isRequired
      />
      <TextInput
        control={form.control}
        name="external_port"
        label="External port"
        isRequired
        description="The port on the floating IP, or a range such as 2200:2210."
      />
      <SelectInput
        control={form.control}
        name="target_id"
        label="Internal IP address"
        options={items.map((t) => ({ id: t.id, label: t.name }))}
        isRequired
        isDisabled={targets.isPending || items.length === 0}
        placeholder={
          targets.isPending
            ? "Loading addresses..."
            : items.length === 0
              ? "No reachable addresses"
              : "Choose an address"
        }
      />
      <TextInput
        control={form.control}
        name="internal_port"
        label="Internal port"
        isRequired
        description="The port on the internal address, or a range of the same size as the external one."
      />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
        rows={2}
      />
    </FormDialog>
  );
}
