// The dialogs behind the Routers panel: create, edit, set gateway, add
// interface and add static route (Horizon's routers/forms.py,
// routers/ports/forms.py and extraroutes/forms.py).
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert } from "@ardc-ui/react";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import {
  CheckboxesInput,
  SelectInput,
  SwitchInput,
  TextInput,
} from "../../../components/Form/fields";
import type { Router, RouterCreateRequest } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import {
  interfaceCandidatesQuery,
  networkOptionsQuery,
  useAddInterface,
  useCreateRouter,
  useSetGateway,
  useSetRoutes,
  useUpdateRouter,
} from "../api";
import { parseCidr, parseIp } from "../networks/subnetRules";

const NAME = z.string().trim().max(255, "At most 255 characters");

function FloatingNetworkSelect<T extends { external_network_id: string }>({
  control,
  options,
  isRequired,
  description,
}: {
  control: Parameters<typeof SelectInput<T>>[0]["control"];
  options: { id: string; name: string }[] | undefined;
  isRequired?: boolean;
  description?: string;
}) {
  const choices = (options ?? []).map((n) => ({ id: n.id, label: n.name }));
  return (
    <SelectInput
      control={control}
      name={
        "external_network_id" as Parameters<typeof SelectInput<T>>[0]["name"]
      }
      label="External network"
      options={
        isRequired ? choices : [{ id: "", label: "No gateway" }, ...choices]
      }
      isRequired={isRequired ?? false}
      isDisabled={options === undefined}
      placeholder={
        options === undefined
          ? "Loading networks..."
          : choices.length === 0
            ? "No external networks are available"
            : "Choose a network"
      }
      description={
        description ??
        "Only networks Nectar marks as floating can be a gateway; it gives the router's subnets a route out and lets floating IPs reach them."
      }
    />
  );
}

// --- create ------------------------------------------------------------------

const createSchema = z.object({
  name: NAME,
  admin_state_up: z.boolean(),
  external_network_id: z.string(),
  availability_zone_hints: z.array(z.string()),
});

export function CreateRouterDialog({
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
  const create = useCreateRouter(projectId);
  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      admin_state_up: true,
      external_network_id: "",
      availability_zone_hints: [],
    },
  });
  const zones = options.data?.availability_zones?.router ?? [];
  const reset = () => {
    form.reset();
    create.reset();
  };
  const submit = form.handleSubmit((values) => {
    const body: RouterCreateRequest = { admin_state_up: values.admin_state_up };
    if (values.name) body.name = values.name;
    if (values.external_network_id) {
      body.external_network_id = values.external_network_id;
    }
    if (values.availability_zone_hints.length > 0) {
      body.availability_zone_hints = values.availability_zone_hints;
    }
    create.mutate(body, {
      onSuccess: (router) => {
        notify.success(`Router ${router.name} was created.`);
        reset();
        onOpenChange(false);
      },
    });
  });
  const errors = Object.entries(options.data?.errors ?? {});
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
      title="Create router"
      submitLabel="Create router"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error ?? options.error}
    >
      {errors.length > 0 && (
        <Alert tone="warning" title="Some choices could not be loaded">
          <ul>
            {errors.map(([name, error]) => (
              <li key={name}>
                {name.replace(/_/g, " ")}: {error.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <TextInput control={form.control} name="name" label="Router name" />
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Enable admin state (the router is up)"
      />
      <FloatingNetworkSelect
        control={form.control}
        options={options.data?.floating_networks ?? undefined}
      />
      {zones.length > 0 && (
        <CheckboxesInput
          control={form.control}
          name="availability_zone_hints"
          label="Availability zone hints"
          options={zones.map((z) => ({ id: z, label: z }))}
          description="Zones where the router may be scheduled. Leaving every box clear is the same as selecting them all."
        />
      )}
    </FormDialog>
  );
}

// --- edit --------------------------------------------------------------------

const editSchema = z.object({ name: NAME, admin_state_up: z.boolean() });

export function EditRouterDialog({
  projectId,
  router,
  onClose,
}: {
  projectId: string;
  router: Router;
  onClose: () => void;
}) {
  const update = useUpdateRouter(projectId);
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: router.name === router.id ? "" : router.name,
      admin_state_up: router.admin_state_up ?? true,
    },
  });
  const submit = form.handleSubmit((values) => {
    const body: Parameters<typeof update.mutate>[0] = { routerId: router.id };
    if (values.name !== router.name) body.name = values.name;
    if (values.admin_state_up !== router.admin_state_up) {
      body.admin_state_up = values.admin_state_up;
    }
    if (Object.keys(body).length === 1) {
      onClose();
      return;
    }
    update.mutate(body, {
      onSuccess: (updated) => {
        notify.success(`Router ${updated.name} updated.`);
        onClose();
      },
    });
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Edit router ${router.name}`}
      submitLabel="Save"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
    >
      <TextInput control={form.control} name="name" label="Router name" />
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Enable admin state (the router is up)"
      />
    </FormDialog>
  );
}

// --- set gateway -------------------------------------------------------------

const gatewaySchema = z.object({
  external_network_id: z.string().min(1, "Choose an external network"),
});

export function SetGatewayDialog({
  projectId,
  router,
  onClose,
}: {
  projectId: string;
  router: Router;
  onClose: () => void;
}) {
  const options = useQuery(networkOptionsQuery(projectId));
  const setGateway = useSetGateway(projectId);
  const form = useForm<z.infer<typeof gatewaySchema>>({
    resolver: zodResolver(gatewaySchema),
    defaultValues: { external_network_id: "" },
  });
  const submit = form.handleSubmit((values) => {
    setGateway.mutate(
      { routerId: router.id, networkId: values.external_network_id },
      {
        onSuccess: () => {
          notify.success(`Gateway set on router ${router.name}.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Set gateway on ${router.name}`}
      submitLabel="Set gateway"
      onSubmit={submit}
      isPending={setGateway.isPending}
      error={setGateway.error ?? options.error}
    >
      <FloatingNetworkSelect
        control={form.control}
        options={options.data?.floating_networks ?? undefined}
        isRequired
      />
    </FormDialog>
  );
}

// --- add interface -----------------------------------------------------------

const interfaceSchema = z
  .object({
    subnet_id: z.string().min(1, "Choose a subnet"),
    ip_address: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (values.ip_address && !parseIp(values.ip_address)) {
      ctx.addIssue({
        code: "custom",
        path: ["ip_address"],
        message: "Enter an IP address",
      });
    }
  });

export function AddInterfaceDialog({
  projectId,
  router,
  onClose,
}: {
  projectId: string;
  router: Router;
  onClose: () => void;
}) {
  const candidates = useQuery(interfaceCandidatesQuery(projectId, router.id));
  const add = useAddInterface(projectId);
  const form = useForm<z.infer<typeof interfaceSchema>>({
    resolver: zodResolver(interfaceSchema),
    defaultValues: { subnet_id: "", ip_address: "" },
  });
  const subnetId = useWatch({ control: form.control, name: "subnet_id" });
  const chosen = (candidates.data?.items ?? []).find((s) => s.id === subnetId);
  const submit = form.handleSubmit((values) => {
    add.mutate(
      {
        routerId: router.id,
        subnet_id: values.subnet_id,
        ...(values.ip_address ? { ip_address: values.ip_address } : {}),
      },
      {
        onSuccess: (result) => {
          notify.success(
            `Interface added${result.ip_address ? ` with address ${result.ip_address}` : ""}.`,
          );
          onClose();
        },
      },
    );
  });
  const items = candidates.data?.items ?? [];
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Add interface to ${router.name}`}
      submitLabel="Add interface"
      onSubmit={submit}
      isPending={add.isPending}
      error={add.error ?? candidates.error}
    >
      <SelectInput
        control={form.control}
        name="subnet_id"
        label="Subnet"
        options={items.map((s) => ({
          id: s.id,
          label: `${s.network_name ? `${s.network_name}: ` : ""}${s.cidr} (${s.name || s.id})`,
        }))}
        isRequired
        isDisabled={candidates.isPending || items.length === 0}
        placeholder={
          candidates.isPending
            ? "Loading subnets..."
            : items.length === 0
              ? "No subnets available"
              : "Choose a subnet"
        }
        description="Subnets of your own networks that have a gateway and are not on this router yet."
      />
      <TextInput
        control={form.control}
        name="ip_address"
        label="IP address (optional)"
        description={
          chosen?.gateway_ip
            ? `Leave blank to use the subnet's gateway address ${chosen.gateway_ip}.`
            : "Leave blank to use the subnet's gateway address."
        }
      />
    </FormDialog>
  );
}

// --- add static route --------------------------------------------------------

const routeSchema = z
  .object({
    destination: z.string().trim().min(1, "Enter the destination CIDR"),
    nexthop: z.string().trim().min(1, "Enter the next hop address"),
  })
  .superRefine((values, ctx) => {
    const destination = parseCidr(values.destination);
    if (!destination) {
      ctx.addIssue({
        code: "custom",
        path: ["destination"],
        message: "Enter a CIDR such as 10.1.0.0/16",
      });
    }
    const nexthop = parseIp(values.nexthop);
    if (!nexthop) {
      ctx.addIssue({
        code: "custom",
        path: ["nexthop"],
        message: "Enter an IP address",
      });
    } else if (destination && destination.version !== nexthop) {
      ctx.addIssue({
        code: "custom",
        path: ["nexthop"],
        message: "The destination and next hop must be the same IP version",
      });
    }
  });

export function AddRouteDialog({
  projectId,
  router,
  onClose,
}: {
  projectId: string;
  router: Router;
  onClose: () => void;
}) {
  const setRoutes = useSetRoutes(projectId);
  const form = useForm<z.infer<typeof routeSchema>>({
    resolver: zodResolver(routeSchema),
    defaultValues: { destination: "", nexthop: "" },
  });
  const submit = form.handleSubmit((values) => {
    setRoutes.mutate(
      {
        routerId: router.id,
        routes: [
          { destination: values.destination, nexthop: values.nexthop },
          ...router.routes,
        ],
      },
      {
        onSuccess: () => {
          notify.success("Static route added.");
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Add static route to ${router.name}`}
      submitLabel="Add route"
      onSubmit={submit}
      isPending={setRoutes.isPending}
      error={setRoutes.error}
    >
      <TextInput
        control={form.control}
        name="destination"
        label="Destination CIDR"
        isRequired
      />
      <TextInput
        control={form.control}
        name="nexthop"
        label="Next hop"
        isRequired
        description="An address reachable from one of the router's interfaces."
      />
    </FormDialog>
  );
}
