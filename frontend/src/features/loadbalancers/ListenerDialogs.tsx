// Create and edit listeners (octavia-dashboard workflow/listener).
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  NumberInput,
  SelectInput,
  SwitchInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import type { Listener, LoadBalancerTree } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import {
  loadBalancerOptionsQuery,
  useCreateListener,
  useUpdateListener,
} from "./api";
import { CIDR, defaultPort, poolProtocolFor } from "./status";

const schema = z
  .object({
    name: z.string().trim().max(255),
    description: z.string().trim().max(255),
    protocol: z.string().min(1, "Choose a protocol"),
    protocol_port: z.number().int().min(1).max(65535),
    connection_limit: z.number().int().min(-1),
    allowed_cidrs: z.string().trim(),
    xff: z.boolean(),
    xfp: z.boolean(),
    xfproto: z.boolean(),
    tls_ref: z.string().trim(),
    default_pool_id: z.string(),
    admin_state_up: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.protocol === "TERMINATED_HTTPS" && !v.tls_ref) {
      ctx.addIssue({
        code: "custom",
        path: ["tls_ref"],
        message: "Enter the certificate reference",
      });
    }
    for (const cidr of v.allowed_cidrs.split(/\s+/).filter(Boolean)) {
      if (!CIDR.test(cidr)) {
        ctx.addIssue({
          code: "custom",
          path: ["allowed_cidrs"],
          message: `"${cidr}" is not a CIDR`,
        });
        break;
      }
    }
  });

type FormValues = z.infer<typeof schema>;

function poolsFor(tree: LoadBalancerTree, protocol: string) {
  const wanted = poolProtocolFor(protocol);
  return tree.pools.filter((p) => p.protocol === wanted);
}

export function CreateListenerDialog({
  projectId,
  tree,
  onClose,
}: {
  projectId: string;
  tree: LoadBalancerTree;
  onClose: () => void;
}) {
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const create = useCreateListener(projectId);
  const used = tree.listeners.map((l) => l.protocol_port);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: "",
      protocol: "HTTP",
      protocol_port: defaultPort("HTTP", used),
      connection_limit: -1,
      allowed_cidrs: "",
      xff: false,
      xfp: false,
      xfproto: false,
      tls_ref: "",
      default_pool_id: "",
      admin_state_up: true,
    },
  });
  const protocol = useWatch({ control: form.control, name: "protocol" });
  useEffect(() => {
    form.setValue("protocol_port", defaultPort(protocol, used));
    form.setValue("default_pool_id", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocol]);
  const submit = form.handleSubmit((v) => {
    const cidrs = v.allowed_cidrs.split(/\s+/).filter(Boolean);
    create.mutate(
      {
        loadbalancer_id: tree.load_balancer.id,
        protocol: v.protocol,
        protocol_port: v.protocol_port,
        connection_limit: v.connection_limit,
        admin_state_up: v.admin_state_up,
        ...(v.name ? { name: v.name } : {}),
        ...(v.description ? { description: v.description } : {}),
        ...(cidrs.length ? { allowed_cidrs: cidrs } : {}),
        ...(["HTTP", "TERMINATED_HTTPS"].includes(v.protocol)
          ? {
              insert_headers: {
                "X-Forwarded-For": v.xff,
                "X-Forwarded-Port": v.xfp,
                "X-Forwarded-Proto": v.xfproto,
              },
            }
          : {}),
        ...(v.protocol === "TERMINATED_HTTPS"
          ? { default_tls_container_ref: v.tls_ref }
          : {}),
        ...(v.default_pool_id ? { default_pool_id: v.default_pool_id } : {}),
      },
      {
        onSuccess: () => {
          notify.success("A new listener is being created.");
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Create listener"
      submitLabel="Create listener"
      size="lg"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <TextInput control={form.control} name="name" label="Name" />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
        rows={2}
      />
      <SelectInput
        control={form.control}
        name="protocol"
        label="Protocol"
        options={(
          options.data?.listener_protocols ?? [
            "HTTP",
            "TCP",
            "TERMINATED_HTTPS",
            "HTTPS",
            "UDP",
            "SCTP",
          ]
        ).map((p) => ({ id: p, label: p }))}
        isRequired
      />
      <NumberInput
        control={form.control}
        name="protocol_port"
        label="Port"
        minValue={1}
        maxValue={65535}
        isRequired
      />
      {protocol === "TERMINATED_HTTPS" && (
        <TextInput
          control={form.control}
          name="tls_ref"
          label="TLS certificate reference"
          description="The Barbican container or PKCS12 secret reference."
          isRequired
        />
      )}
      {["HTTP", "TERMINATED_HTTPS"].includes(protocol) && (
        <>
          <SwitchInput
            control={form.control}
            name="xff"
            label="Insert X-Forwarded-For header"
          />
          <SwitchInput
            control={form.control}
            name="xfp"
            label="Insert X-Forwarded-Port header"
          />
          <SwitchInput
            control={form.control}
            name="xfproto"
            label="Insert X-Forwarded-Proto header"
          />
        </>
      )}
      <SelectInput
        control={form.control}
        name="default_pool_id"
        label="Default pool"
        options={[
          { id: "", label: "None" },
          ...poolsFor(tree, protocol).map((p) => ({
            id: p.id,
            label: p.name || p.id,
          })),
        ]}
      />
      <NumberInput
        control={form.control}
        name="connection_limit"
        label="Connection limit"
        description="-1 for no limit."
        minValue={-1}
      />
      <TextAreaInput
        control={form.control}
        name="allowed_cidrs"
        label="Allowed CIDRs"
        description="One per line; empty allows all sources."
        rows={2}
      />
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Admin state up"
      />
    </FormDialog>
  );
}

const editSchema = z.object({
  name: z.string().trim().max(255),
  description: z.string().trim().max(255),
  connection_limit: z.number().int().min(-1),
  allowed_cidrs: z
    .string()
    .trim()
    .refine(
      (v) =>
        v
          .split(/\s+/)
          .filter(Boolean)
          .every((c) => CIDR.test(c)),
      "Enter one CIDR per line",
    ),
  xff: z.boolean(),
  xfp: z.boolean(),
  xfproto: z.boolean(),
  default_pool_id: z.string(),
  admin_state_up: z.boolean(),
});

export function EditListenerDialog({
  projectId,
  tree,
  listener,
  onClose,
}: {
  projectId: string;
  tree: LoadBalancerTree;
  listener: Listener;
  onClose: () => void;
}) {
  const update = useUpdateListener(projectId);
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: listener.name ?? "",
      description: listener.description ?? "",
      connection_limit: listener.connection_limit ?? -1,
      allowed_cidrs: listener.allowed_cidrs.join("\n"),
      xff: listener.insert_headers["X-Forwarded-For"] === "true",
      xfp: listener.insert_headers["X-Forwarded-Port"] === "true",
      xfproto: listener.insert_headers["X-Forwarded-Proto"] === "true",
      default_pool_id: listener.default_pool_id ?? "",
      admin_state_up: listener.admin_state_up ?? true,
    },
  });
  const submit = form.handleSubmit((v) => {
    update.mutate(
      {
        id: listener.id,
        name: v.name,
        description: v.description,
        connection_limit: v.connection_limit,
        allowed_cidrs: v.allowed_cidrs.split(/\s+/).filter(Boolean),
        admin_state_up: v.admin_state_up,
        ...(["HTTP", "TERMINATED_HTTPS"].includes(listener.protocol)
          ? {
              insert_headers: {
                "X-Forwarded-For": v.xff,
                "X-Forwarded-Port": v.xfp,
                "X-Forwarded-Proto": v.xfproto,
              },
            }
          : {}),
        ...(v.default_pool_id ? { default_pool_id: v.default_pool_id } : {}),
      },
      {
        onSuccess: () => {
          notify.success("The listener has been updated.");
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Edit listener ${listener.name || listener.id}`}
      submitLabel="Save"
      size="lg"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
    >
      <p>
        {listener.protocol} on port {listener.protocol_port}. The protocol and
        port cannot be changed.
      </p>
      <TextInput control={form.control} name="name" label="Name" />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
        rows={2}
      />
      {["HTTP", "TERMINATED_HTTPS"].includes(listener.protocol) && (
        <>
          <SwitchInput
            control={form.control}
            name="xff"
            label="Insert X-Forwarded-For header"
          />
          <SwitchInput
            control={form.control}
            name="xfp"
            label="Insert X-Forwarded-Port header"
          />
          <SwitchInput
            control={form.control}
            name="xfproto"
            label="Insert X-Forwarded-Proto header"
          />
        </>
      )}
      <SelectInput
        control={form.control}
        name="default_pool_id"
        label="Default pool"
        options={[
          { id: "", label: "None" },
          ...poolsFor(tree, listener.protocol).map((p) => ({
            id: p.id,
            label: p.name || p.id,
          })),
        ]}
      />
      <NumberInput
        control={form.control}
        name="connection_limit"
        label="Connection limit"
        minValue={-1}
      />
      <TextAreaInput
        control={form.control}
        name="allowed_cidrs"
        label="Allowed CIDRs"
        rows={2}
      />
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Admin state up"
      />
    </FormDialog>
  );
}
