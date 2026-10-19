// The create load balancer wizard (octavia-dashboard workflow): details,
// then an optional listener, pool, members and health monitor that the
// backend creates one after another once the load balancer is active.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Accordion,
  AccordionItem,
  Alert,
  Button,
  Label,
  Loading,
  Select,
  SelectItem,
  StepItem,
  Stepper,
} from "@ardc-ui/react";
import { loadingProps } from "../../components/buttonState";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import {
  NumberInput,
  SelectInput,
  SwitchInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import type { LoadBalancerOptions } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { loadBalancerOptionsQuery, useCreateLoadBalancer } from "./api";
import {
  defaultPort,
  memberDefaultPort,
  persistenceTypesFor,
  poolProtocolFor,
  TLS_REF_HELP,
} from "./status";
import {
  DEFAULTS,
  newMember,
  STEPS,
  toRequest,
  wizardSchema,
  type WizardValues,
} from "./wizard";
import styles from "./LoadBalancers.module.scss";

type Form = UseFormReturn<WizardValues>;

/**
 * Keeps the wizard's linked fields in step when the user changes one, as
 * listener.controller.js `protocolChange` and the `createChange` handlers
 * of each step do. A change subscription (not a mount effect in the step
 * panel, which the Stepper remounts on every visit) so returning to a step
 * never resets what the user chose.
 */
function useLinkedFields(form: Form, data: LoadBalancerOptions | undefined) {
  const persistence = data?.persistence_types;
  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      switch (name) {
        case "l_protocol": {
          const protocol = values.l_protocol ?? "";
          form.setValue(
            "l_protocol_port",
            // Undefined empties the field: TCP, UDP and friends have no
            // default port, so the user picks one.
            defaultPort(protocol, []) as number,
          );
          const memberPort = memberDefaultPort(poolProtocolFor(protocol));
          (values.members ?? []).forEach((_, index) =>
            form.setValue(
              `members.${index}.protocol_port`,
              memberPort as number,
            ),
          );
          const allowed = persistenceTypesFor(
            poolProtocolFor(protocol),
            persistence ?? [],
          );
          if (values.p_persistence && !allowed.includes(values.p_persistence))
            form.setValue("p_persistence", "");
          break;
        }
        case "create_listener":
          if (!values.create_listener) {
            form.setValue("create_pool", false);
            form.setValue("create_monitor", false);
          }
          break;
        case "create_pool":
          if (values.create_pool) form.setValue("create_listener", true);
          else form.setValue("create_monitor", false);
          break;
        case "create_monitor":
          if (values.create_monitor) {
            form.setValue("create_listener", true);
            form.setValue("create_pool", true);
          }
          break;
        default:
          break;
      }
    });
    return () => subscription.unsubscribe();
  }, [form, persistence]);
}

export function CreateLoadBalancerPage() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const create = useCreateLoadBalancer(projectId);
  const [step, setStep] = useState(0);
  const [created, setCreated] = useState(false);
  const form = useForm<WizardValues>({
    resolver: zodResolver(wizardSchema),
    mode: "onTouched",
    defaultValues: DEFAULTS,
  });
  useLinkedFields(form, options.data);
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
                  <Loading>Loading load balancer options...</Loading>
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
            ) : (
              <Button
                onPress={() => void submit()}
                {...loadingProps(create.isPending, "Creating...")}
                isPending={create.isPending}
              >
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
              description={TLS_REF_HELP}
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
            <Accordion>
              <AccordionItem id="timeouts" title="Timeouts (milliseconds)">
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
              </AccordionItem>
            </Accordion>
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
              ...persistenceTypesFor(protocol, data.persistence_types).map(
                (t) => ({ id: t, label: t.replace(/_/g, " ") }),
              ),
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
  const port = memberDefaultPort(poolProtocolFor(listenerProtocol));
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
    append(
      newMember(port, {
        name: instance?.name ?? "",
        address,
        subnet_id: subnet ?? "",
      }),
    );
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
          onPress={() => append(newMember(port))}
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
