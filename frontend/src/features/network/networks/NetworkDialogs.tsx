// The dialogs behind the Networks panel: create a network (with its first
// subnet, as Horizon's wizard), edit a network, create or edit a subnet,
// create or edit a port.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert } from "@ardc-ui/react";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import {
  CheckboxesInput,
  RadioInput,
  SelectInput,
  SwitchInput,
  TextAreaInput,
  TextInput,
} from "../../../components/Form/fields";
import type {
  Network,
  NetworkCreateRequest,
  NetworkOptions,
  Port,
  PortCreateRequest,
  SubnetDetail,
} from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import {
  networkOptionsQuery,
  securityGroupsQuery,
  useCreateNetwork,
  useCreatePort,
  useCreateSubnet,
  useUpdateNetwork,
  useUpdatePort,
  useUpdateSubnet,
} from "../api";
import {
  checkSubnetForm,
  emptySubnetForm,
  parseIp,
  subnetFieldsFromForm,
  subnetFormFromDetail,
  type SubnetFormValues,
} from "./subnetRules";
import styles from "./NetworkDialogs.module.scss";

const NAME = z.string().trim().max(255, "At most 255 characters");

const subnetShape = {
  name: NAME,
  address_source: z.enum(["manual", "pool"]),
  subnetpool_id: z.string(),
  prefixlen: z.string(),
  cidr: z.string().trim(),
  ip_version: z.enum(["4", "6"]),
  gateway_ip: z.string().trim(),
  no_gateway: z.boolean(),
  enable_dhcp: z.boolean(),
  allocation_pools: z.string(),
  dns_nameservers: z.string(),
  host_routes: z.string(),
};

function addSubnetIssues(
  values: SubnetFormValues,
  ctx: z.RefinementCtx,
  options: { isCreate: boolean; enableIpv6: boolean },
  prefix: string[] = [],
) {
  for (const [field, message] of Object.entries(
    checkSubnetForm(values, options),
  )) {
    ctx.addIssue({ code: "custom", path: [...prefix, field], message });
  }
}

function OptionErrors({ options }: { options: NetworkOptions | undefined }) {
  const entries = Object.entries(options?.errors ?? {});
  if (entries.length === 0) return null;
  return (
    <Alert tone="warning" title="Some choices could not be loaded">
      <ul>
        {entries.map(([name, error]) => (
          <li key={name}>
            {name.replace(/_/g, " ")}: {error.message}
          </li>
        ))}
      </ul>
    </Alert>
  );
}

/** The subnet fields shared by the create network, create subnet and edit
 * subnet dialogs. `prefix` nests them under a form object key. */
function SubnetFields<
  T extends { subnet: SubnetFormValues } | SubnetFormValues,
>({
  control,
  prefix,
  options,
  isCreate,
  watch,
}: {
  control: Parameters<typeof TextInput<T>>[0]["control"];
  prefix: "subnet." | "";
  options: NetworkOptions | undefined;
  isCreate: boolean;
  watch: Pick<SubnetFormValues, "address_source" | "no_gateway" | "cidr">;
}) {
  type Name = Parameters<typeof TextInput<T>>[0]["name"];
  const field = (name: keyof SubnetFormValues) => `${prefix}${name}` as Name;
  const pools = options?.subnetpools ?? [];
  const enableIpv6 = options?.enable_ipv6 ?? false;
  return (
    <>
      <TextInput control={control} name={field("name")} label="Subnet name" />
      {isCreate && pools.length > 0 && (
        <RadioInput
          control={control}
          name={field("address_source")}
          label="Network address source"
          options={[
            { id: "manual", label: "Enter the network address manually" },
            { id: "pool", label: "Allocate the network address from a pool" },
          ]}
        />
      )}
      {isCreate && watch.address_source === "pool" ? (
        <>
          <SelectInput
            control={control}
            name={field("subnetpool_id")}
            label="Address pool"
            options={pools.map((p) => ({
              id: p.id,
              label: p.prefixes.length
                ? `${p.name} (${p.prefixes.join(", ")})`
                : p.name,
            }))}
            isRequired
            placeholder="Choose a pool"
          />
          <TextInput
            control={control}
            name={field("prefixlen")}
            label="Network mask length"
            description="Leave blank for the pool's default prefix length."
          />
        </>
      ) : (
        <TextInput
          control={control}
          name={field("cidr")}
          label="Network address"
          isRequired={isCreate}
          isDisabled={!isCreate}
          description={
            isCreate
              ? "In CIDR form, such as 192.168.0.0/24."
              : "The address cannot change once the subnet exists."
          }
        />
      )}
      {isCreate && enableIpv6 && (
        <RadioInput
          control={control}
          name={field("ip_version")}
          label="IP version"
          options={[
            { id: "4", label: "IPv4" },
            { id: "6", label: "IPv6" },
          ]}
        />
      )}
      {!watch.no_gateway && (
        <TextInput
          control={control}
          name={field("gateway_ip")}
          label="Gateway IP"
          description="Leave blank for the first address of the network (192.168.0.1 for 192.168.0.0/24)."
        />
      )}
      <SwitchInput
        control={control}
        name={field("no_gateway")}
        label="Disable gateway"
      />
      <h3 className={styles.subheading}>Subnet details</h3>
      <SwitchInput
        control={control}
        name={field("enable_dhcp")}
        label="Enable DHCP"
      />
      <TextAreaInput
        control={control}
        name={field("allocation_pools")}
        label="Allocation pools"
        rows={3}
        monospace
        description="One pool per line as start,end (192.168.1.100,192.168.1.120). Blank for the whole range."
      />
      <TextAreaInput
        control={control}
        name={field("dns_nameservers")}
        label="DNS name servers"
        rows={3}
        monospace
        description="One IP address per line."
      />
      <TextAreaInput
        control={control}
        name={field("host_routes")}
        label="Host routes"
        rows={3}
        monospace
        description="One route per line as destination,nexthop (192.168.200.0/24,10.56.1.254)."
      />
    </>
  );
}

// --- create network ---------------------------------------------------------

export function CreateNetworkDialog({
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
  const create = useCreateNetwork(projectId);
  const enableIpv6 = options.data?.enable_ipv6 ?? false;
  const schema = useMemo(
    () =>
      z
        .object({
          name: NAME,
          admin_state_up: z.boolean(),
          with_subnet: z.boolean(),
          availability_zone_hints: z.array(z.string()),
          mtu: z.string().trim(),
          subnet: z.object(subnetShape),
        })
        .superRefine((values, ctx) => {
          if (values.mtu && !/^\d+$/.test(values.mtu)) {
            ctx.addIssue({
              code: "custom",
              path: ["mtu"],
              message: "Enter a whole number of bytes",
            });
          } else if (values.mtu && Number(values.mtu) < 68) {
            ctx.addIssue({
              code: "custom",
              path: ["mtu"],
              message: "The minimum MTU is 68 bytes",
            });
          }
          if (values.with_subnet) {
            addSubnetIssues(
              values.subnet,
              ctx,
              { isCreate: true, enableIpv6 },
              ["subnet"],
            );
          }
        }),
    [enableIpv6],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      admin_state_up: true,
      with_subnet: true,
      availability_zone_hints: [],
      mtu: "",
      subnet: emptySubnetForm(options.data?.default_dns_nameservers ?? []),
    },
  });
  // The default name servers arrive with the options; fill them in once.
  const dns = useWatch({
    control: form.control,
    name: "subnet.dns_nameservers",
  });
  const defaults = options.data?.default_dns_nameservers;
  if (
    defaults &&
    defaults.length > 0 &&
    dns === "" &&
    !form.formState.isDirty
  ) {
    form.setValue("subnet.dns_nameservers", defaults.join("\n"));
  }
  const withSubnet = useWatch({ control: form.control, name: "with_subnet" });
  const addressSource = useWatch({
    control: form.control,
    name: "subnet.address_source",
  });
  const noGateway = useWatch({
    control: form.control,
    name: "subnet.no_gateway",
  });
  const cidr = useWatch({ control: form.control, name: "subnet.cidr" });
  const zones = options.data?.availability_zones?.network ?? [];

  const reset = () => {
    form.reset();
    create.reset();
  };
  const submit = form.handleSubmit((values) => {
    const body: NetworkCreateRequest = {
      admin_state_up: values.admin_state_up,
    };
    if (values.name) body.name = values.name;
    if (values.mtu) body.mtu = Number(values.mtu);
    if (values.availability_zone_hints.length > 0) {
      body.availability_zone_hints = values.availability_zone_hints;
    }
    if (values.with_subnet) body.subnet = subnetFieldsFromForm(values.subnet);
    create.mutate(body, {
      onSuccess: (network) => {
        notify.success(`Created network ${network.name || network.id}.`);
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
      title="Create network"
      submitLabel="Create network"
      size="lg"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error ?? options.error}
    >
      <OptionErrors options={options.data} />
      <TextInput control={form.control} name="name" label="Network name" />
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Enable admin state (the network is up)"
      />
      {zones.length > 0 && (
        <CheckboxesInput
          control={form.control}
          name="availability_zone_hints"
          label="Availability zone hints"
          options={zones.map((z) => ({ id: z, label: z }))}
          description="Zones where the DHCP agents may be scheduled. Leaving every box clear is the same as selecting them all."
        />
      )}
      <TextInput
        control={form.control}
        name="mtu"
        label="MTU"
        description="Maximum transmission unit in bytes. Leave blank for the default."
      />
      <SwitchInput
        control={form.control}
        name="with_subnet"
        label="Create a subnet on the network"
      />
      {withSubnet && (
        <div className={styles.group}>
          <h3 className={styles.subheading}>Subnet</h3>
          <SubnetFields<Values>
            control={form.control}
            prefix="subnet."
            options={options.data}
            isCreate
            watch={{
              address_source: addressSource,
              no_gateway: noGateway,
              cidr,
            }}
          />
        </div>
      )}
    </FormDialog>
  );
}

// --- edit network -----------------------------------------------------------

const editNetworkSchema = z.object({
  name: NAME,
  admin_state_up: z.boolean(),
});

export function EditNetworkDialog({
  projectId,
  network,
  onClose,
}: {
  projectId: string;
  network: Network;
  onClose: () => void;
}) {
  const update = useUpdateNetwork(projectId);
  const form = useForm<z.infer<typeof editNetworkSchema>>({
    resolver: zodResolver(editNetworkSchema),
    defaultValues: {
      name: network.name === network.id ? "" : network.name,
      admin_state_up: network.admin_state_up ?? true,
    },
  });
  const submit = form.handleSubmit((values) => {
    const body: Parameters<typeof update.mutate>[0] = {
      networkId: network.id,
    };
    if (values.name !== network.name) body.name = values.name;
    if (values.admin_state_up !== network.admin_state_up) {
      body.admin_state_up = values.admin_state_up;
    }
    if (Object.keys(body).length === 1) {
      onClose();
      return;
    }
    update.mutate(body, {
      onSuccess: (updated) => {
        notify.success(`Network ${updated.name || updated.id} updated.`);
        onClose();
      },
    });
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Edit network ${network.name}`}
      submitLabel="Save"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
    >
      <TextInput control={form.control} name="name" label="Network name" />
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Enable admin state (the network is up)"
      />
    </FormDialog>
  );
}

// --- create and edit subnet -------------------------------------------------

export function SubnetDialog({
  projectId,
  network,
  subnet,
  onClose,
}: {
  projectId: string;
  network: Pick<Network, "id" | "name">;
  /** Present when editing. */
  subnet?: SubnetDetail | undefined;
  onClose: () => void;
}) {
  const isCreate = subnet === undefined;
  const options = useQuery(networkOptionsQuery(projectId));
  const create = useCreateSubnet(projectId);
  const update = useUpdateSubnet(projectId);
  const enableIpv6 = options.data?.enable_ipv6 ?? false;
  const schema = useMemo(
    () =>
      z
        .object(subnetShape)
        .superRefine((values, ctx) =>
          addSubnetIssues(values, ctx, { isCreate, enableIpv6 }),
        ),
    [isCreate, enableIpv6],
  );
  const previous = useMemo(
    () => (subnet ? subnetFormFromDetail(subnet) : undefined),
    [subnet],
  );
  const form = useForm<SubnetFormValues>({
    resolver: zodResolver(schema),
    defaultValues:
      previous ?? emptySubnetForm(options.data?.default_dns_nameservers ?? []),
  });
  const dns = useWatch({ control: form.control, name: "dns_nameservers" });
  const defaults = options.data?.default_dns_nameservers;
  if (
    isCreate &&
    defaults &&
    defaults.length > 0 &&
    dns === "" &&
    !form.formState.isDirty
  ) {
    form.setValue("dns_nameservers", defaults.join("\n"));
  }
  const addressSource = useWatch({
    control: form.control,
    name: "address_source",
  });
  const noGateway = useWatch({ control: form.control, name: "no_gateway" });
  const cidr = useWatch({ control: form.control, name: "cidr" });

  const submit = form.handleSubmit((values) => {
    if (subnet && previous) {
      const fields = subnetFieldsFromForm(values, previous);
      if (Object.keys(fields).length === 0) {
        onClose();
        return;
      }
      update.mutate(
        { subnetId: subnet.id, ...fields },
        {
          onSuccess: (updated) => {
            notify.success(`Subnet ${updated.name || updated.id} updated.`);
            onClose();
          },
        },
      );
      return;
    }
    create.mutate(
      { network_id: network.id, ...subnetFieldsFromForm(values) },
      {
        onSuccess: (created) => {
          notify.success(
            `Created subnet ${created.name || created.cidr || created.id} on ${network.name}.`,
          );
          onClose();
        },
      },
    );
  });

  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={
        subnet
          ? `Edit subnet ${subnet.name || subnet.cidr || subnet.id}`
          : `Create subnet on ${network.name}`
      }
      submitLabel={subnet ? "Save" : "Create subnet"}
      size="lg"
      onSubmit={submit}
      isPending={create.isPending || update.isPending}
      error={create.error ?? update.error ?? options.error}
    >
      <OptionErrors options={options.data} />
      <SubnetFields<SubnetFormValues>
        control={form.control}
        prefix=""
        options={options.data}
        isCreate={isCreate}
        watch={{ address_source: addressSource, no_gateway: noGateway, cidr }}
      />
    </FormDialog>
  );
}

// --- create and edit port ---------------------------------------------------

const portSchema = z
  .object({
    name: NAME,
    admin_state_up: z.boolean(),
    device_id: NAME,
    device_owner: NAME,
    specify_ip: z.enum(["", "subnet", "fixed"]),
    subnet_id: z.string(),
    fixed_ip: z.string().trim(),
    mac_address: z.string().trim(),
    port_security_enabled: z.boolean(),
    security_groups: z.array(z.string()),
  })
  .superRefine((values, ctx) => {
    if (values.specify_ip === "subnet" && !values.subnet_id) {
      ctx.addIssue({
        code: "custom",
        path: ["subnet_id"],
        message: "Choose a subnet",
      });
    }
    if (values.specify_ip === "fixed") {
      if (!values.fixed_ip) {
        ctx.addIssue({
          code: "custom",
          path: ["fixed_ip"],
          message: "Enter the fixed IP address",
        });
      } else if (!parseIp(values.fixed_ip)) {
        ctx.addIssue({
          code: "custom",
          path: ["fixed_ip"],
          message: "Enter an IP address",
        });
      }
    }
    if (
      values.mac_address &&
      !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(values.mac_address)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["mac_address"],
        message: "Enter a MAC address such as fa:16:3e:00:00:01",
      });
    }
  });

export function PortDialog({
  projectId,
  network,
  port,
  onClose,
}: {
  projectId: string;
  network: Pick<Network, "id" | "name" | "subnets">;
  /** Present when editing. */
  port?: Port | undefined;
  onClose: () => void;
}) {
  const isCreate = port === undefined;
  const options = useQuery(networkOptionsQuery(projectId));
  const groups = useQuery(securityGroupsQuery(projectId));
  const create = useCreatePort(projectId);
  const update = useUpdatePort(projectId);
  const portSecurity = options.data?.extensions?.port_security ?? true;
  const defaultGroups = useMemo(
    () =>
      (groups.data?.items ?? [])
        .filter((g) => g.name === "default")
        .map((g) => g.id),
    [groups.data],
  );
  const form = useForm<z.infer<typeof portSchema>>({
    resolver: zodResolver(portSchema),
    defaultValues: {
      name: port?.name ?? "",
      admin_state_up: port?.admin_state_up ?? true,
      device_id: "",
      device_owner: "",
      specify_ip: "",
      subnet_id: "",
      fixed_ip: "",
      mac_address: "",
      port_security_enabled: port?.port_security_enabled ?? true,
      security_groups: port?.security_groups ?? [],
    },
  });
  // A new port starts with the default group, once the list is known.
  const chosen = useWatch({ control: form.control, name: "security_groups" });
  if (
    isCreate &&
    defaultGroups.length > 0 &&
    chosen.length === 0 &&
    !form.formState.dirtyFields.security_groups
  ) {
    form.setValue("security_groups", defaultGroups);
  }
  const specifyIp = useWatch({ control: form.control, name: "specify_ip" });
  const securityOn = useWatch({
    control: form.control,
    name: "port_security_enabled",
  });

  const submit = form.handleSubmit((values) => {
    if (port) {
      const body: Parameters<typeof update.mutate>[0] = { portId: port.id };
      if (values.name !== port.name) body.name = values.name;
      if (values.admin_state_up !== port.admin_state_up) {
        body.admin_state_up = values.admin_state_up;
      }
      if (portSecurity) {
        if (values.port_security_enabled !== port.port_security_enabled) {
          body.port_security_enabled = values.port_security_enabled;
        }
        if (
          values.port_security_enabled &&
          [...values.security_groups].sort().join() !==
            [...port.security_groups].sort().join()
        ) {
          body.security_groups = values.security_groups;
        }
      }
      if (Object.keys(body).length === 1) {
        onClose();
        return;
      }
      update.mutate(body, {
        onSuccess: (updated) => {
          notify.success(`Port ${updated.name || updated.id} updated.`);
          onClose();
        },
      });
      return;
    }
    const body: PortCreateRequest = {
      network_id: network.id,
      admin_state_up: values.admin_state_up,
    };
    if (values.name) body.name = values.name;
    if (values.device_id) body.device_id = values.device_id;
    if (values.device_owner) body.device_owner = values.device_owner;
    if (values.specify_ip === "subnet") body.subnet_id = values.subnet_id;
    if (values.specify_ip === "fixed") body.fixed_ip = values.fixed_ip;
    if (values.mac_address) body.mac_address = values.mac_address;
    if (portSecurity) {
      body.port_security_enabled = values.port_security_enabled;
      if (values.port_security_enabled) {
        body.security_groups = values.security_groups;
      }
    }
    create.mutate(body, {
      onSuccess: (created) => {
        notify.success(
          `Created port ${created.name || created.id} on ${network.name}.`,
        );
        onClose();
      },
    });
  });

  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={
        port
          ? `Edit port ${port.name || port.id}`
          : `Create port on ${network.name}`
      }
      submitLabel={port ? "Save" : "Create port"}
      size="lg"
      onSubmit={submit}
      isPending={create.isPending || update.isPending}
      error={create.error ?? update.error}
    >
      <TextInput control={form.control} name="name" label="Port name" />
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Enable admin state (the port is up)"
      />
      {isCreate && (
        <>
          <TextInput
            control={form.control}
            name="device_id"
            label="Device ID"
            description="Optional. The device the port is attached to."
          />
          <TextInput
            control={form.control}
            name="device_owner"
            label="Device owner"
            description="Optional. The owner of the attached device."
          />
          {network.subnets.length > 0 && (
            <RadioInput
              control={form.control}
              name="specify_ip"
              label="Address"
              options={[
                { id: "", label: "Any address (neutron picks one)" },
                { id: "subnet", label: "An address on a chosen subnet" },
                { id: "fixed", label: "A fixed IP address" },
              ]}
            />
          )}
          {specifyIp === "subnet" && (
            <SelectInput
              control={form.control}
              name="subnet_id"
              label="Subnet"
              options={network.subnets.map((s) => ({
                id: s.id,
                label: `${s.name || s.id} ${s.cidr ?? ""}`.trim(),
              }))}
              isRequired
              placeholder="Choose a subnet"
            />
          )}
          {specifyIp === "fixed" && (
            <TextInput
              control={form.control}
              name="fixed_ip"
              label="Fixed IP address"
              isRequired
            />
          )}
          <TextInput
            control={form.control}
            name="mac_address"
            label="MAC address"
            description="Optional. Leave blank to have one generated."
          />
        </>
      )}
      {portSecurity && (
        <SwitchInput
          control={form.control}
          name="port_security_enabled"
          label="Port security (anti-spoofing rules and security groups)"
        />
      )}
      {portSecurity && securityOn && (
        <CheckboxesInput
          control={form.control}
          name="security_groups"
          label="Security groups"
          options={(groups.data?.items ?? []).map((g) => ({
            id: g.id,
            label: g.name,
            ...(g.description ? { description: g.description } : {}),
          }))}
          description={
            groups.isPending
              ? "Loading security groups..."
              : "The default group applies unless you remove it."
          }
        />
      )}
    </FormDialog>
  );
}
