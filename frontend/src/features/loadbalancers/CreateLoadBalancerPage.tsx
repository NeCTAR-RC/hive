// The create load balancer wizard (octavia-dashboard workflow): details,
// then an optional listener, pool, members and health monitor that the
// backend creates one after another once the load balancer is active.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import type { FieldPath, UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Alert,
  Button,
  Label,
  Select,
  SelectItem,
  StepItem,
  Stepper,
} from "@ardc-ui/react";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import {
  NumberInput,
  SelectInput,
  SwitchInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import type {
  LoadBalancerCreateRequest,
  LoadBalancerOptions,
  MemberSpec,
} from "../../lib/api/types";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { loadBalancerOptionsQuery, useCreateLoadBalancer } from "./api";
import {
  CIDR,
  defaultPort,
  EXPECTED_CODES,
  IP,
  poolProtocolFor,
  URL_PATH,
} from "./status";
import styles from "./LoadBalancers.module.scss";

const memberSchema = z.object({
  name: z.string().trim(),
  address: z
    .string()
    .trim()
    .min(1, "Enter an IP address")
    .regex(IP, "Enter a valid IP address"),
  subnet_id: z.string(),
  protocol_port: z.number().int().min(1).max(65535),
  weight: z.number().int().min(0).max(256),
  backup: z.boolean(),
});

const schema = z
  .object({
    name: z.string().trim().max(255),
    description: z.string().trim().max(255),
    vip_subnet_id: z.string().min(1, "Choose a subnet"),
    vip_address: z
      .string()
      .trim()
      .refine((v) => !v || IP.test(v), "The IP address is not valid."),
    flavor_id: z.string(),
    availability_zone: z.string(),
    admin_state_up: z.boolean(),
    create_listener: z.boolean(),
    l_name: z.string().trim().max(255),
    l_protocol: z.string(),
    l_protocol_port: z.number().int().min(1).max(65535),
    l_connection_limit: z.number().int().min(-1),
    l_allowed_cidrs: z.string().trim(),
    l_xff: z.boolean(),
    l_xfp: z.boolean(),
    l_xfproto: z.boolean(),
    l_tls_ref: z.string().trim(),
    l_timeout_client_data: z.number().int().min(0),
    l_timeout_member_connect: z.number().int().min(0),
    l_timeout_member_data: z.number().int().min(0),
    l_timeout_tcp_inspect: z.number().int().min(0),
    create_pool: z.boolean(),
    p_name: z.string().trim().max(255),
    p_algorithm: z.string(),
    p_persistence: z.string(),
    p_cookie_name: z.string().trim(),
    members: z.array(memberSchema),
    create_monitor: z.boolean(),
    m_type: z.string(),
    m_delay: z.number().int().min(0),
    m_timeout: z.number().int().min(0),
    m_max_retries: z.number().int().min(1).max(10),
    m_max_retries_down: z.number().int().min(1).max(10),
    m_http_method: z.string(),
    m_url_path: z.string().trim(),
    m_expected_codes: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    if (v.create_listener) {
      if (!v.l_protocol)
        ctx.addIssue({
          code: "custom",
          path: ["l_protocol"],
          message: "Choose a protocol",
        });
      if (v.l_protocol === "TERMINATED_HTTPS" && !v.l_tls_ref) {
        ctx.addIssue({
          code: "custom",
          path: ["l_tls_ref"],
          message: "Enter the Barbican container or secret reference",
        });
      }
      for (const cidr of v.l_allowed_cidrs.split(/\s+/).filter(Boolean)) {
        if (!CIDR.test(cidr)) {
          ctx.addIssue({
            code: "custom",
            path: ["l_allowed_cidrs"],
            message: `"${cidr}" is not a CIDR`,
          });
          break;
        }
      }
    }
    if (v.create_pool) {
      if (!v.p_algorithm)
        ctx.addIssue({
          code: "custom",
          path: ["p_algorithm"],
          message: "Choose an algorithm",
        });
      if (v.p_persistence === "APP_COOKIE" && !v.p_cookie_name) {
        ctx.addIssue({
          code: "custom",
          path: ["p_cookie_name"],
          message: "Enter the cookie name",
        });
      }
    }
    if (v.create_monitor) {
      if (!v.m_type)
        ctx.addIssue({
          code: "custom",
          path: ["m_type"],
          message: "Choose a monitor type",
        });
      if (v.m_delay < v.m_timeout)
        ctx.addIssue({
          code: "custom",
          path: ["m_delay"],
          message: "The delay must be at least the timeout",
        });
      if (["HTTP", "HTTPS"].includes(v.m_type)) {
        if (!EXPECTED_CODES.test(v.m_expected_codes || "200")) {
          ctx.addIssue({
            code: "custom",
            path: ["m_expected_codes"],
            message: "A code, a range (200-204) or a list (200,301)",
          });
        }
        if (!URL_PATH.test(v.m_url_path || "/")) {
          ctx.addIssue({
            code: "custom",
            path: ["m_url_path"],
            message: "The path must start with a slash",
          });
        }
      }
    }
  });

type FormValues = z.infer<typeof schema>;
type Form = UseFormReturn<FormValues>;

interface Step {
  id: string;
  title: string;
  fields: FieldPath<FormValues>[];
}

const STEPS: Step[] = [
  {
    id: "details",
    title: "Load balancer",
    fields: [
      "name",
      "vip_subnet_id",
      "vip_address",
      "flavor_id",
      "availability_zone",
    ],
  },
  {
    id: "listener",
    title: "Listener",
    fields: [
      "create_listener",
      "l_protocol",
      "l_protocol_port",
      "l_connection_limit",
      "l_allowed_cidrs",
      "l_tls_ref",
    ],
  },
  {
    id: "pool",
    title: "Pool",
    fields: ["create_pool", "p_algorithm", "p_persistence", "p_cookie_name"],
  },
  { id: "members", title: "Members", fields: ["members"] },
  {
    id: "monitor",
    title: "Health monitor",
    fields: [
      "create_monitor",
      "m_type",
      "m_delay",
      "m_timeout",
      "m_max_retries",
      "m_max_retries_down",
      "m_url_path",
      "m_expected_codes",
    ],
  },
];

const DEFAULTS: FormValues = {
  name: "",
  description: "",
  vip_subnet_id: "",
  vip_address: "",
  flavor_id: "",
  availability_zone: "",
  admin_state_up: true,
  create_listener: true,
  l_name: "",
  l_protocol: "HTTP",
  l_protocol_port: 80,
  l_connection_limit: -1,
  l_allowed_cidrs: "",
  l_xff: false,
  l_xfp: false,
  l_xfproto: false,
  l_tls_ref: "",
  l_timeout_client_data: 50000,
  l_timeout_member_connect: 5000,
  l_timeout_member_data: 50000,
  l_timeout_tcp_inspect: 0,
  create_pool: true,
  p_name: "",
  p_algorithm: "ROUND_ROBIN",
  p_persistence: "",
  p_cookie_name: "",
  members: [],
  create_monitor: false,
  m_type: "HTTP",
  m_delay: 5,
  m_timeout: 5,
  m_max_retries: 3,
  m_max_retries_down: 3,
  m_http_method: "GET",
  m_url_path: "/",
  m_expected_codes: "200",
};

function toRequest(v: FormValues): LoadBalancerCreateRequest {
  const request: LoadBalancerCreateRequest = {
    vip_subnet_id: v.vip_subnet_id,
    admin_state_up: v.admin_state_up,
    ...(v.name ? { name: v.name } : {}),
    ...(v.description ? { description: v.description } : {}),
    ...(v.vip_address ? { vip_address: v.vip_address } : {}),
    ...(v.flavor_id ? { flavor_id: v.flavor_id } : {}),
    ...(v.availability_zone ? { availability_zone: v.availability_zone } : {}),
  };
  if (!v.create_listener) return request;
  const cidrs = v.l_allowed_cidrs.split(/\s+/).filter(Boolean);
  request.listener = {
    protocol: v.l_protocol,
    protocol_port: v.l_protocol_port,
    connection_limit: v.l_connection_limit,
    admin_state_up: true,
    ...(v.l_name ? { name: v.l_name } : {}),
    ...(cidrs.length ? { allowed_cidrs: cidrs } : {}),
    ...(["HTTP", "TERMINATED_HTTPS"].includes(v.l_protocol)
      ? {
          insert_headers: {
            "X-Forwarded-For": v.l_xff,
            "X-Forwarded-Port": v.l_xfp,
            "X-Forwarded-Proto": v.l_xfproto,
          },
        }
      : {}),
    ...(v.l_protocol === "TERMINATED_HTTPS" && v.l_tls_ref
      ? { default_tls_container_ref: v.l_tls_ref }
      : {}),
    ...(!["UDP", "SCTP"].includes(v.l_protocol)
      ? {
          timeout_client_data: v.l_timeout_client_data,
          timeout_member_connect: v.l_timeout_member_connect,
          timeout_member_data: v.l_timeout_member_data,
          timeout_tcp_inspect: v.l_timeout_tcp_inspect,
        }
      : {}),
  };
  if (!v.create_pool) return request;
  request.pool = {
    lb_algorithm: v.p_algorithm,
    admin_state_up: true,
    ...(v.p_name ? { name: v.p_name } : {}),
    session_persistence: v.p_persistence
      ? {
          type: v.p_persistence,
          ...(v.p_persistence === "APP_COOKIE"
            ? { cookie_name: v.p_cookie_name }
            : {}),
        }
      : null,
  };
  request.members = v.members.map<MemberSpec>((m) => ({
    address: m.address,
    protocol_port: m.protocol_port,
    weight: m.weight,
    backup: m.backup,
    admin_state_up: true,
    ...(m.subnet_id ? { subnet_id: m.subnet_id } : {}),
    ...(m.name ? { name: m.name } : {}),
  }));
  if (v.create_monitor) {
    request.monitor = {
      type: v.m_type,
      delay: v.m_delay,
      timeout: v.m_timeout,
      max_retries: v.m_max_retries,
      max_retries_down: v.m_max_retries_down,
      admin_state_up: true,
      ...(["HTTP", "HTTPS"].includes(v.m_type)
        ? {
            http_method: v.m_http_method,
            url_path: v.m_url_path || "/",
            expected_codes: v.m_expected_codes || "200",
          }
        : {}),
    };
  }
  return request;
}

export function CreateLoadBalancerPage() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const create = useCreateLoadBalancer(projectId);
  const [step, setStep] = useState(0);
  const [created, setCreated] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: DEFAULTS,
  });
  const blocker = useBlocker({
    shouldBlockFn: () => form.formState.isDirty && !created,
    enableBeforeUnload: () => form.formState.isDirty && !created,
    withResolver: true,
  });
  useEffect(() => {
    if (created) void navigate({ to: "/load-balancers" });
  }, [created, navigate]);

  const next = async () => {
    const current = STEPS[step];
    if (!current) return;
    const valid = await form.trigger(current.fields, { shouldFocus: true });
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const submit = form.handleSubmit(
    (values) => {
      create.mutate(toRequest(values), {
        onSuccess: () => {
          notify.success("A new load balancer is being created.");
          setCreated(true);
        },
      });
    },
    (errors) => {
      const index = STEPS.findIndex((s) => s.fields.some((f) => f in errors));
      if (index >= 0) setStep(index);
    },
  );

  const current = STEPS[step]!;
  const data = options.data;
  return (
    <>
      <PageHeader
        title="Create load balancer"
        crumbs={[
          { label: "Project" },
          { label: "Network" },
          { label: "Load Balancers", href: "/load-balancers" },
        ]}
      />
      {options.isError ? (
        <ErrorState error={options.error} onRetry={() => options.refetch()} />
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (step === STEPS.length - 1) void submit();
            else void next();
          }}
          noValidate
          className={styles.wizard}
        >
          {data && data.subnets.length === 0 && (
            <Alert tone="warning" role="status">
              Your project has no subnet to put the load balancer on. Create a
              network with a subnet first.
            </Alert>
          )}
          <Stepper
            activeStep={current.id}
            onActiveStepChange={(key) => {
              const index = STEPS.findIndex((s) => s.id === key);
              if (index >= 0 && index < step) setStep(index);
            }}
            allowsJumping
            aria-label="Create load balancer steps"
          >
            {STEPS.map((s) => (
              <StepItem key={s.id} id={s.id} title={s.title}>
                {!data ? (
                  <SkeletonLines lines={6} />
                ) : (
                  <StepBody id={s.id} form={form} data={data} />
                )}
              </StepItem>
            ))}
          </Stepper>
          {create.isError && (
            <ErrorState
              error={create.error}
              title="Could not create the load balancer"
            />
          )}
          <div className={styles.buttons}>
            <Button
              variant="secondary"
              onPress={back}
              isDisabled={step === 0 || create.isPending}
            >
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onPress={() => void next()} isDisabled={!data}>
                Next
              </Button>
            ) : create.isPending ? (
              <Button state="loading" loadingText="Creating..." isDisabled>
                Create load balancer
              </Button>
            ) : (
              <Button onPress={() => void submit()}>
                Create load balancer
              </Button>
            )}
          </div>
        </form>
      )}
      <ConfirmDialog
        isOpen={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
        title="Leave without creating the load balancer?"
        confirmLabel="Leave"
        onConfirm={() => blocker.proceed?.()}
      >
        <p>Your choices on this page will be lost.</p>
      </ConfirmDialog>
    </>
  );
}

function StepBody({
  id,
  form,
  data,
}: {
  id: string;
  form: Form;
  data: LoadBalancerOptions;
}) {
  switch (id) {
    case "details":
      return <DetailsStep form={form} data={data} />;
    case "listener":
      return <ListenerStep form={form} data={data} />;
    case "pool":
      return <PoolStep form={form} data={data} />;
    case "members":
      return <MembersStep form={form} data={data} />;
    case "monitor":
      return <MonitorStep form={form} data={data} />;
    default:
      return null;
  }
}

function DetailsStep({
  form,
  data,
}: {
  form: Form;
  data: LoadBalancerOptions;
}) {
  return (
    <div className={styles.fields}>
      <TextInput control={form.control} name="name" label="Name" />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
        rows={2}
      />
      <SelectInput
        control={form.control}
        name="vip_subnet_id"
        label="Subnet"
        description="The subnet the load balancer's address is taken from."
        options={data.subnets.map((s) => ({
          id: s.id,
          label: `${s.network_name ?? s.network_id}: ${s.cidr ?? ""} (${s.name ?? s.id})`,
        }))}
        isRequired
      />
      <TextInput
        control={form.control}
        name="vip_address"
        label="IP address"
        description="Optional; an address on the subnet to use for the VIP."
      />
      {data.availability_zones.length > 0 && (
        <SelectInput
          control={form.control}
          name="availability_zone"
          label="Availability zone"
          options={[
            { id: "", label: "Any" },
            ...data.availability_zones.map((z) => ({
              id: z.name,
              label: z.name,
            })),
          ]}
        />
      )}
      {data.flavors.length > 0 && (
        <SelectInput
          control={form.control}
          name="flavor_id"
          label="Flavour"
          options={[
            { id: "", label: "Default" },
            ...data.flavors.map((f) => ({
              id: f.id,
              label: f.description ? `${f.name}: ${f.description}` : f.name,
            })),
          ]}
        />
      )}
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Admin state up"
      />
    </div>
  );
}

function ListenerStep({
  form,
  data,
}: {
  form: Form;
  data: LoadBalancerOptions;
}) {
  const [enabled, protocol] = useWatch({
    control: form.control,
    name: ["create_listener", "l_protocol"],
  });
  useEffect(() => {
    if (!enabled) {
      form.setValue("create_pool", false);
      form.setValue("create_monitor", false);
    }
  }, [enabled, form]);
  useEffect(() => {
    if (protocol) form.setValue("l_protocol_port", defaultPort(protocol, []));
  }, [protocol, form]);
  return (
    <div className={styles.fields}>
      <SwitchInput
        control={form.control}
        name="create_listener"
        label="Create a listener now"
      />
      {enabled && (
        <>
          <TextInput control={form.control} name="l_name" label="Name" />
          <SelectInput
            control={form.control}
            name="l_protocol"
            label="Protocol"
            options={data.listener_protocols.map((p) => ({ id: p, label: p }))}
            isRequired
          />
          <NumberInput
            control={form.control}
            name="l_protocol_port"
            label="Port"
            minValue={1}
            maxValue={65535}
            isRequired
          />
          {protocol === "TERMINATED_HTTPS" && (
            <TextInput
              control={form.control}
              name="l_tls_ref"
              label="TLS certificate reference"
              description="The Barbican container or PKCS12 secret reference holding the certificate and key."
              isRequired
            />
          )}
          {["HTTP", "TERMINATED_HTTPS"].includes(protocol) && (
            <>
              <SwitchInput
                control={form.control}
                name="l_xff"
                label="Insert X-Forwarded-For header"
              />
              <SwitchInput
                control={form.control}
                name="l_xfp"
                label="Insert X-Forwarded-Port header"
              />
              <SwitchInput
                control={form.control}
                name="l_xfproto"
                label="Insert X-Forwarded-Proto header"
              />
            </>
          )}
          <NumberInput
            control={form.control}
            name="l_connection_limit"
            label="Connection limit"
            description="-1 for no limit."
            minValue={-1}
          />
          <TextAreaInput
            control={form.control}
            name="l_allowed_cidrs"
            label="Allowed CIDRs"
            description="One CIDR per line; leave empty to allow all sources."
            rows={2}
          />
          {!["UDP", "SCTP"].includes(protocol) && (
            <details className={styles.advanced}>
              <summary>Timeouts (milliseconds)</summary>
              <div className={styles.fields}>
                <NumberInput
                  control={form.control}
                  name="l_timeout_client_data"
                  label="Client data timeout"
                  minValue={0}
                />
                <NumberInput
                  control={form.control}
                  name="l_timeout_member_connect"
                  label="Member connect timeout"
                  minValue={0}
                />
                <NumberInput
                  control={form.control}
                  name="l_timeout_member_data"
                  label="Member data timeout"
                  minValue={0}
                />
                <NumberInput
                  control={form.control}
                  name="l_timeout_tcp_inspect"
                  label="TCP inspect timeout"
                  minValue={0}
                />
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function PoolStep({ form, data }: { form: Form; data: LoadBalancerOptions }) {
  const [enabled, persistence, listenerProtocol] = useWatch({
    control: form.control,
    name: ["create_pool", "p_persistence", "l_protocol"],
  });
  useEffect(() => {
    if (enabled) form.setValue("create_listener", true);
    else form.setValue("create_monitor", false);
  }, [enabled, form]);
  const protocol = poolProtocolFor(listenerProtocol);
  return (
    <div className={styles.fields}>
      <SwitchInput
        control={form.control}
        name="create_pool"
        label="Create a pool now"
      />
      {enabled && (
        <>
          <p className={styles.muted}>
            The pool uses the listener&apos;s protocol: {protocol}.
          </p>
          <TextInput control={form.control} name="p_name" label="Name" />
          <SelectInput
            control={form.control}
            name="p_algorithm"
            label="Algorithm"
            options={data.algorithms.map((a) => ({
              id: a,
              label: a.replace(/_/g, " "),
            }))}
            isRequired
          />
          <SelectInput
            control={form.control}
            name="p_persistence"
            label="Session persistence"
            options={[
              { id: "", label: "None" },
              ...data.persistence_types
                .filter(
                  (t) =>
                    !["UDP", "SCTP"].includes(listenerProtocol) ||
                    t === "SOURCE_IP",
                )
                .map((t) => ({ id: t, label: t.replace(/_/g, " ") })),
            ]}
          />
          {persistence === "APP_COOKIE" && (
            <TextInput
              control={form.control}
              name="p_cookie_name"
              label="Cookie name"
              isRequired
            />
          )}
        </>
      )}
    </div>
  );
}

function MembersStep({
  form,
  data,
}: {
  form: Form;
  data: LoadBalancerOptions;
}) {
  const [enabled, listenerProtocol] = useWatch({
    control: form.control,
    name: ["create_pool", "l_protocol"],
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "members",
  });
  const [picked, setPicked] = useState<string>("");
  const port = defaultPort(poolProtocolFor(listenerProtocol), []);
  const instanceOptions = data.instances.flatMap((instance) =>
    instance.addresses.map((address) => ({
      id: `${instance.id}|${address.address}|${address.subnet_id}`,
      label: `${instance.name ?? instance.id}: ${address.address}`,
    })),
  );
  if (!enabled) {
    return (
      <p className={styles.muted}>
        Members belong to a pool. Turn the pool on to add members.
      </p>
    );
  }
  const addInstance = () => {
    const [, address, subnet] = picked.split("|");
    const instance = data.instances.find((i) => picked.startsWith(`${i.id}|`));
    if (!address) return;
    append({
      name: instance?.name ?? "",
      address,
      subnet_id: subnet ?? "",
      protocol_port: port,
      weight: 1,
      backup: false,
    });
    setPicked("");
  };
  return (
    <div className={styles.fields}>
      <div className={styles.addRow}>
        <Select
          selectedKey={picked || null}
          onSelectionChange={(key) => setPicked(key ? String(key) : "")}
          placeholder={
            instanceOptions.length
              ? "Choose an instance"
              : "No instances with addresses on the subnets"
          }
          isDisabled={instanceOptions.length === 0}
          className={styles.grow}
        >
          <Label>Available instances</Label>
          {instanceOptions.map((option) => (
            <SelectItem key={option.id} id={option.id} textValue={option.label}>
              {option.label}
            </SelectItem>
          ))}
        </Select>
        <Button
          variant="secondary"
          size="sm"
          onPress={addInstance}
          isDisabled={!picked}
        >
          Add instance
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onPress={() =>
            append({
              name: "",
              address: "",
              subnet_id: "",
              protocol_port: port,
              weight: 1,
              backup: false,
            })
          }
        >
          Add external member
        </Button>
      </div>
      {fields.length === 0 ? (
        <p className={styles.muted}>
          No members yet. The pool can be created without members.
        </p>
      ) : (
        <ol className={styles.memberList} aria-label="Members">
          {fields.map((field, index) => (
            <li key={field.id} className={styles.memberRow}>
              <TextInput
                control={form.control}
                name={`members.${index}.address`}
                label="IP address"
                isRequired
              />
              <SelectInput
                control={form.control}
                name={`members.${index}.subnet_id`}
                label="Subnet"
                options={[
                  { id: "", label: "None" },
                  ...data.subnets.map((s) => ({
                    id: s.id,
                    label: `${s.name ?? s.id} (${s.cidr ?? ""})`,
                  })),
                ]}
              />
              <NumberInput
                control={form.control}
                name={`members.${index}.protocol_port`}
                label="Port"
                minValue={1}
                maxValue={65535}
                isRequired
              />
              <NumberInput
                control={form.control}
                name={`members.${index}.weight`}
                label="Weight"
                minValue={0}
                maxValue={256}
              />
              <SwitchInput
                control={form.control}
                name={`members.${index}.backup`}
                label="Backup member"
              />
              <Button
                variant="secondary"
                size="xs"
                onPress={() => remove(index)}
              >
                Remove member
              </Button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function MonitorStep({
  form,
  data,
}: {
  form: Form;
  data: LoadBalancerOptions;
}) {
  const [enabled, type] = useWatch({
    control: form.control,
    name: ["create_monitor", "m_type"],
  });
  useEffect(() => {
    if (enabled) {
      form.setValue("create_listener", true);
      form.setValue("create_pool", true);
    }
  }, [enabled, form]);
  return (
    <div className={styles.fields}>
      <SwitchInput
        control={form.control}
        name="create_monitor"
        label="Create a health monitor now"
      />
      {enabled && (
        <>
          <SelectInput
            control={form.control}
            name="m_type"
            label="Type"
            options={data.monitor_types.map((t) => ({ id: t, label: t }))}
            isRequired
          />
          <NumberInput
            control={form.control}
            name="m_delay"
            label="Delay (seconds)"
            minValue={0}
            isRequired
          />
          <NumberInput
            control={form.control}
            name="m_timeout"
            label="Timeout (seconds)"
            minValue={0}
            isRequired
          />
          <NumberInput
            control={form.control}
            name="m_max_retries"
            label="Retries before marking up"
            minValue={1}
            maxValue={10}
            isRequired
          />
          <NumberInput
            control={form.control}
            name="m_max_retries_down"
            label="Retries before marking down"
            minValue={1}
            maxValue={10}
            isRequired
          />
          {["HTTP", "HTTPS"].includes(type) && (
            <>
              <SelectInput
                control={form.control}
                name="m_http_method"
                label="HTTP method"
                options={data.http_methods.map((m) => ({ id: m, label: m }))}
              />
              <TextInput
                control={form.control}
                name="m_url_path"
                label="URL path"
              />
              <TextInput
                control={form.control}
                name="m_expected_codes"
                label="Expected status codes"
                description="A code, a range (200-204) or a list (200,301)."
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
