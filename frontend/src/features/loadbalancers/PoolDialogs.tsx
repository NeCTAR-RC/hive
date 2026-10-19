// Pool, member and health monitor dialogs (octavia-dashboard
// workflow/pool, members and monitor steps).
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Label, Select, SelectItem } from "@ardc-ui/react";
import {
  NumberInput,
  SelectInput,
  SwitchInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import type {
  HealthMonitor,
  LoadBalancerTree,
  Member,
  Pool,
} from "../../lib/api/types";
import { notify } from "../../lib/notify";
import {
  loadBalancerOptionsQuery,
  useAddMember,
  useCreateMonitor,
  useCreatePool,
  useUpdateMember,
  useUpdateMonitor,
  useUpdatePool,
} from "./api";
import {
  EXPECTED_CODES,
  isIp,
  memberDefaultPort,
  persistenceTypesFor,
  poolProtocolFor,
  URL_PATH,
} from "./status";
import styles from "./LoadBalancers.module.scss";

const poolSchema = z
  .object({
    name: z.string().trim().max(255),
    description: z.string().trim().max(255),
    listener_id: z.string(),
    protocol: z.string(),
    lb_algorithm: z.string().min(1, "Choose an algorithm"),
    persistence: z.string(),
    cookie_name: z.string().trim(),
    admin_state_up: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.listener_id && !v.protocol) {
      ctx.addIssue({
        code: "custom",
        path: ["protocol"],
        message: "Choose a protocol or a listener",
      });
    }
    if (v.persistence === "APP_COOKIE" && !v.cookie_name) {
      ctx.addIssue({
        code: "custom",
        path: ["cookie_name"],
        message: "Enter the cookie name",
      });
    }
  });

export function CreatePoolDialog({
  projectId,
  tree,
  onClose,
}: {
  projectId: string;
  tree: LoadBalancerTree;
  onClose: () => void;
}) {
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const create = useCreatePool(projectId);
  const freeListeners = tree.listeners.filter((l) => !l.default_pool_id);
  const form = useForm<z.infer<typeof poolSchema>>({
    resolver: zodResolver(poolSchema),
    defaultValues: {
      name: "",
      description: "",
      listener_id: freeListeners[0]?.id ?? "",
      protocol: "",
      lb_algorithm: "ROUND_ROBIN",
      persistence: "",
      cookie_name: "",
      admin_state_up: true,
    },
  });
  const [listenerId, persistence] = useWatch({
    control: form.control,
    name: ["listener_id", "persistence"],
  });
  const listener = tree.listeners.find((l) => l.id === listenerId);
  const chosenProtocol = useWatch({ control: form.control, name: "protocol" });
  const protocol = listener
    ? poolProtocolFor(listener.protocol)
    : chosenProtocol;
  const persistenceTypes = persistenceTypesFor(
    protocol,
    options.data?.persistence_types ?? [],
  );
  // A persistence type the new protocol cannot use goes back to None.
  const persistenceKey = persistenceTypes.join(",");
  useEffect(() => {
    const current = form.getValues("persistence");
    if (current && options.data && !persistenceKey.split(",").includes(current))
      form.setValue("persistence", "");
  }, [persistenceKey, options.data, form]);
  const submit = form.handleSubmit((v) => {
    create.mutate(
      {
        loadbalancer_id: tree.load_balancer.id,
        ...(v.listener_id
          ? { listener_id: v.listener_id }
          : { protocol: v.protocol }),
        lb_algorithm: v.lb_algorithm,
        admin_state_up: v.admin_state_up,
        ...(v.name ? { name: v.name } : {}),
        ...(v.description ? { description: v.description } : {}),
        session_persistence: v.persistence
          ? {
              type: v.persistence,
              ...(v.persistence === "APP_COOKIE"
                ? { cookie_name: v.cookie_name }
                : {}),
            }
          : null,
      },
      {
        onSuccess: () => {
          notify.success("A new pool is being created.");
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Create pool"
      submitLabel="Create pool"
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
        name="listener_id"
        label="Listener"
        description="The pool becomes the listener's default pool. Without a listener, choose the protocol."
        options={[
          { id: "", label: "No listener yet" },
          ...freeListeners.map((l) => ({
            id: l.id,
            label: `${l.name || l.id} (${l.protocol} ${l.protocol_port})`,
          })),
        ]}
      />
      {listener ? (
        <p className={styles.muted}>
          The pool uses {poolProtocolFor(listener.protocol)}.
        </p>
      ) : (
        <SelectInput
          control={form.control}
          name="protocol"
          label="Protocol"
          options={(options.data?.pool_protocols ?? []).map((p) => ({
            id: p,
            label: p,
          }))}
          isRequired
        />
      )}
      <SelectInput
        control={form.control}
        name="lb_algorithm"
        label="Algorithm"
        options={(
          options.data?.algorithms ?? [
            "ROUND_ROBIN",
            "LEAST_CONNECTIONS",
            "SOURCE_IP",
          ]
        ).map((a) => ({ id: a, label: a.replace(/_/g, " ") }))}
        isRequired
      />
      <SelectInput
        control={form.control}
        name="persistence"
        label="Session persistence"
        options={[
          { id: "", label: "None" },
          ...persistenceTypes.map((t) => ({
            id: t,
            label: t.replace(/_/g, " "),
          })),
        ]}
      />
      {persistence === "APP_COOKIE" && (
        <TextInput
          control={form.control}
          name="cookie_name"
          label="Cookie name"
          isRequired
        />
      )}
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Admin state up"
      />
    </FormDialog>
  );
}

const editPoolSchema = z
  .object({
    name: z.string().trim().max(255),
    description: z.string().trim().max(255),
    lb_algorithm: z.string().min(1),
    persistence: z.string(),
    cookie_name: z.string().trim(),
    tls_enabled: z.boolean(),
    admin_state_up: z.boolean(),
  })
  .refine((v) => v.persistence !== "APP_COOKIE" || v.cookie_name, {
    path: ["cookie_name"],
    message: "Enter the cookie name",
  });

export function EditPoolDialog({
  projectId,
  pool,
  onClose,
}: {
  projectId: string;
  pool: Pool;
  onClose: () => void;
}) {
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const update = useUpdatePool(projectId);
  const form = useForm<z.infer<typeof editPoolSchema>>({
    resolver: zodResolver(editPoolSchema),
    defaultValues: {
      name: pool.name ?? "",
      description: pool.description ?? "",
      lb_algorithm: pool.lb_algorithm ?? "ROUND_ROBIN",
      persistence: pool.session_persistence?.type ?? "",
      cookie_name: pool.session_persistence?.cookie_name ?? "",
      tls_enabled: pool.tls_enabled ?? false,
      admin_state_up: pool.admin_state_up ?? true,
    },
  });
  const persistence = useWatch({ control: form.control, name: "persistence" });
  const submit = form.handleSubmit((v) => {
    update.mutate(
      {
        id: pool.id,
        name: v.name,
        description: v.description,
        lb_algorithm: v.lb_algorithm,
        admin_state_up: v.admin_state_up,
        tls_enabled: v.tls_enabled,
        // null turns persistence off; the backend forwards it.
        session_persistence: v.persistence
          ? {
              type: v.persistence,
              ...(v.persistence === "APP_COOKIE"
                ? { cookie_name: v.cookie_name }
                : {}),
            }
          : null,
      },
      {
        onSuccess: () => {
          notify.success("The pool has been updated.");
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Edit pool ${pool.name || pool.id}`}
      submitLabel="Save"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
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
        name="lb_algorithm"
        label="Algorithm"
        options={(
          options.data?.algorithms ?? [
            "ROUND_ROBIN",
            "LEAST_CONNECTIONS",
            "SOURCE_IP",
          ]
        ).map((a) => ({ id: a, label: a.replace(/_/g, " ") }))}
        isRequired
      />
      <SelectInput
        control={form.control}
        name="persistence"
        label="Session persistence"
        options={[
          { id: "", label: "None" },
          ...persistenceTypesFor(
            pool.protocol,
            options.data?.persistence_types ?? [],
          ).map((t) => ({
            id: t,
            label: t.replace(/_/g, " "),
          })),
        ]}
      />
      {persistence === "APP_COOKIE" && (
        <TextInput
          control={form.control}
          name="cookie_name"
          label="Cookie name"
          isRequired
        />
      )}
      <SwitchInput
        control={form.control}
        name="tls_enabled"
        label="Re-encrypt traffic to the members with TLS"
      />
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Admin state up"
      />
    </FormDialog>
  );
}

const memberSchema = z.object({
  name: z.string().trim(),
  address: z
    .string()
    .trim()
    .min(1, "Enter an IP address")
    .refine(isIp, "Enter a valid IP address"),
  subnet_id: z.string(),
  protocol_port: z
    .number({ error: "Enter a port" })
    .int()
    .min(1, "Ports run from 1 to 65535")
    .max(65535, "Ports run from 1 to 65535"),
  weight: z.number().int().min(0).max(256),
  monitor_address: z
    .string()
    .trim()
    .refine((v) => !v || isIp(v), "Enter a valid IP address"),
  monitor_port: z.number().int().min(1).max(65535).optional(),
  backup: z.boolean(),
  admin_state_up: z.boolean(),
});

export function AddMemberDialog({
  projectId,
  lbId,
  pool,
  onClose,
}: {
  projectId: string;
  lbId: string;
  pool: Pool;
  onClose: () => void;
}) {
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const add = useAddMember(projectId);
  const [picked, setPicked] = useState("");
  const form = useForm<z.infer<typeof memberSchema>>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      name: "",
      address: "",
      subnet_id: "",
      // Empty, for the user to fill, unless the pool is HTTP.
      protocol_port: memberDefaultPort(pool.protocol ?? ""),
      weight: 1,
      monitor_address: "",
      backup: false,
      admin_state_up: true,
    },
  });
  const instanceOptions = (options.data?.instances ?? []).flatMap((instance) =>
    instance.addresses.map((a) => ({
      id: `${instance.id}|${a.address}|${a.subnet_id}`,
      label: `${instance.name ?? instance.id}: ${a.address}`,
      name: instance.name ?? "",
    })),
  );
  const pick = (key: string) => {
    setPicked(key);
    const option = instanceOptions.find((o) => o.id === key);
    if (!option) return;
    const [, address, subnet] = key.split("|");
    form.setValue("address", address ?? "");
    form.setValue("subnet_id", subnet ?? "");
    if (!form.getValues("name")) form.setValue("name", option.name);
  };
  const submit = form.handleSubmit((v) => {
    add.mutate(
      {
        lbId,
        poolId: pool.id,
        address: v.address,
        protocol_port: v.protocol_port,
        weight: v.weight,
        backup: v.backup,
        admin_state_up: v.admin_state_up,
        ...(v.name ? { name: v.name } : {}),
        ...(v.subnet_id ? { subnet_id: v.subnet_id } : {}),
        ...(v.monitor_address ? { monitor_address: v.monitor_address } : {}),
        ...(v.monitor_port ? { monitor_port: v.monitor_port } : {}),
      },
      {
        onSuccess: () => {
          notify.success("Adding the member.");
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Add member"
      submitLabel="Add member"
      size="lg"
      onSubmit={submit}
      isPending={add.isPending}
      error={add.error}
    >
      <Select
        selectedKey={picked || null}
        onSelectionChange={(key) => pick(key ? String(key) : "")}
        placeholder={
          instanceOptions.length
            ? "Choose an instance to fill in its address"
            : "No instances with addresses on the subnets"
        }
        isDisabled={instanceOptions.length === 0}
      >
        <Label>From an instance</Label>
        {instanceOptions.map((o) => (
          <SelectItem key={o.id} id={o.id} textValue={o.label}>
            {o.label}
          </SelectItem>
        ))}
      </Select>
      <TextInput control={form.control} name="name" label="Name" />
      <TextInput
        control={form.control}
        name="address"
        label="IP address"
        isRequired
      />
      <SelectInput
        control={form.control}
        name="subnet_id"
        label="Subnet"
        options={[
          { id: "", label: "None" },
          ...(options.data?.subnets ?? []).map((s) => ({
            id: s.id,
            label: `${s.name ?? s.id} (${s.cidr ?? ""})`,
          })),
        ]}
      />
      <NumberInput
        control={form.control}
        name="protocol_port"
        label="Port"
        minValue={1}
        maxValue={65535}
        isRequired
      />
      <NumberInput
        control={form.control}
        name="weight"
        label="Weight"
        minValue={0}
        maxValue={256}
      />
      <TextInput
        control={form.control}
        name="monitor_address"
        label="Monitor address"
        description="Optional alternate address for health checks."
      />
      <NumberInput
        control={form.control}
        name="monitor_port"
        label="Monitor port"
        minValue={1}
        maxValue={65535}
      />
      <SwitchInput control={form.control} name="backup" label="Backup member" />
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Admin state up"
      />
    </FormDialog>
  );
}

const editMemberSchema = z.object({
  name: z.string().trim(),
  weight: z.number().int().min(0).max(256),
  monitor_address: z
    .string()
    .trim()
    .refine((v) => !v || isIp(v), "Enter a valid IP address"),
  monitor_port: z.number().int().min(1).max(65535).optional(),
  backup: z.boolean(),
  admin_state_up: z.boolean(),
});

export function EditMemberDialog({
  projectId,
  pool,
  member,
  onClose,
}: {
  projectId: string;
  pool: Pool;
  member: Member;
  onClose: () => void;
}) {
  const update = useUpdateMember(projectId);
  const form = useForm<z.infer<typeof editMemberSchema>>({
    resolver: zodResolver(editMemberSchema),
    defaultValues: {
      name: member.name ?? "",
      weight: member.weight ?? 1,
      monitor_address: member.monitor_address ?? "",
      ...(member.monitor_port ? { monitor_port: member.monitor_port } : {}),
      backup: member.backup ?? false,
      admin_state_up: member.admin_state_up ?? true,
    },
  });
  const submit = form.handleSubmit((v) => {
    update.mutate(
      {
        poolId: pool.id,
        memberId: member.id,
        name: v.name,
        weight: v.weight,
        backup: v.backup,
        admin_state_up: v.admin_state_up,
        // Explicit nulls clear the alternate monitor address and port.
        monitor_address: v.monitor_address || null,
        monitor_port: v.monitor_port ?? null,
      },
      {
        onSuccess: () => {
          notify.success("The member has been updated.");
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Edit member ${member.address}:${member.protocol_port}`}
      submitLabel="Save"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
    >
      <p>The address and port cannot be changed.</p>
      <TextInput control={form.control} name="name" label="Name" />
      <NumberInput
        control={form.control}
        name="weight"
        label="Weight"
        minValue={0}
        maxValue={256}
      />
      <TextInput
        control={form.control}
        name="monitor_address"
        label="Monitor address"
      />
      <NumberInput
        control={form.control}
        name="monitor_port"
        label="Monitor port"
        minValue={1}
        maxValue={65535}
      />
      <SwitchInput control={form.control} name="backup" label="Backup member" />
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Admin state up"
      />
    </FormDialog>
  );
}

const monitorSchema = z
  .object({
    name: z.string().trim(),
    type: z.string().min(1, "Choose a type"),
    delay: z.number().int().min(0),
    timeout: z.number().int().min(0),
    max_retries: z.number().int().min(1).max(10),
    max_retries_down: z.number().int().min(1).max(10),
    http_method: z.string(),
    url_path: z.string().trim(),
    expected_codes: z.string().trim(),
    admin_state_up: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.delay < v.timeout)
      ctx.addIssue({
        code: "custom",
        path: ["delay"],
        message: "The delay must be at least the timeout",
      });
    if (["HTTP", "HTTPS"].includes(v.type)) {
      if (!EXPECTED_CODES.test(v.expected_codes || "200")) {
        ctx.addIssue({
          code: "custom",
          path: ["expected_codes"],
          message: "A code, a range (200-204) or a list (200,301)",
        });
      }
      if (!URL_PATH.test(v.url_path || "/")) {
        ctx.addIssue({
          code: "custom",
          path: ["url_path"],
          message: "The path must start with a slash",
        });
      }
    }
  });

export function MonitorDialog({
  projectId,
  pool,
  monitor,
  onClose,
}: {
  projectId: string;
  pool: Pool;
  monitor: HealthMonitor | null;
  onClose: () => void;
}) {
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const create = useCreateMonitor(projectId);
  const update = useUpdateMonitor(projectId);
  const form = useForm<z.infer<typeof monitorSchema>>({
    resolver: zodResolver(monitorSchema),
    defaultValues: {
      name: monitor?.name ?? "",
      type: monitor?.type ?? "HTTP",
      delay: monitor?.delay ?? 5,
      timeout: monitor?.timeout ?? 5,
      max_retries: monitor?.max_retries ?? 3,
      max_retries_down: monitor?.max_retries_down ?? 3,
      http_method: monitor?.http_method ?? "GET",
      url_path: monitor?.url_path ?? "/",
      expected_codes: monitor?.expected_codes ?? "200",
      admin_state_up: monitor?.admin_state_up ?? true,
    },
  });
  const type = useWatch({ control: form.control, name: "type" });
  const http = ["HTTP", "HTTPS"].includes(type);
  const submit = form.handleSubmit((v) => {
    const body = {
      name: v.name,
      delay: v.delay,
      timeout: v.timeout,
      max_retries: v.max_retries,
      max_retries_down: v.max_retries_down,
      admin_state_up: v.admin_state_up,
      ...(http
        ? {
            http_method: v.http_method,
            url_path: v.url_path || "/",
            expected_codes: v.expected_codes || "200",
          }
        : {}),
    };
    const done = () => {
      notify.success(
        monitor
          ? "The health monitor has been updated."
          : "A new health monitor is being created.",
      );
      onClose();
    };
    if (monitor)
      update.mutate({ id: monitor.id, ...body }, { onSuccess: done });
    else
      create.mutate(
        { pool_id: pool.id, type: v.type, ...body },
        { onSuccess: done },
      );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={monitor ? "Edit health monitor" : "Create health monitor"}
      submitLabel={monitor ? "Save" : "Create health monitor"}
      onSubmit={submit}
      isPending={create.isPending || update.isPending}
      error={create.error ?? update.error}
    >
      <TextInput control={form.control} name="name" label="Name" />
      <SelectInput
        control={form.control}
        name="type"
        label="Type"
        options={(
          options.data?.monitor_types ?? [
            "HTTP",
            "HTTPS",
            "PING",
            "TCP",
            "TLS-HELLO",
            "UDP-CONNECT",
            "SCTP",
          ]
        ).map((t) => ({ id: t, label: t }))}
        isRequired
        isDisabled={monitor !== null}
      />
      <NumberInput
        control={form.control}
        name="delay"
        label="Delay (seconds)"
        minValue={0}
        isRequired
      />
      <NumberInput
        control={form.control}
        name="timeout"
        label="Timeout (seconds)"
        minValue={0}
        isRequired
      />
      <NumberInput
        control={form.control}
        name="max_retries"
        label="Retries before marking up"
        minValue={1}
        maxValue={10}
        isRequired
      />
      <NumberInput
        control={form.control}
        name="max_retries_down"
        label="Retries before marking down"
        minValue={1}
        maxValue={10}
        isRequired
      />
      {http && (
        <>
          <SelectInput
            control={form.control}
            name="http_method"
            label="HTTP method"
            options={(options.data?.http_methods ?? ["GET"]).map((m) => ({
              id: m,
              label: m,
            }))}
          />
          <TextInput control={form.control} name="url_path" label="URL path" />
          <TextInput
            control={form.control}
            name="expected_codes"
            label="Expected status codes"
          />
        </>
      )}
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Admin state up"
      />
    </FormDialog>
  );
}
