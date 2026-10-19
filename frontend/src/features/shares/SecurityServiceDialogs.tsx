// Security service forms (manila-ui security_services/forms.py): name,
// type, DNS IP, server, domain, OU, user, password and description.
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  SelectInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import type {
  SecurityService,
  SecurityServiceCreateRequest,
  SecurityServiceUpdateRequest,
} from "../../lib/api/types";
import { notify } from "../../lib/notify";
import {
  securityServicesQuery,
  useCreateSecurityService,
  useUpdateSecurityService,
} from "./api";
import { securityServiceTypeOptions } from "./status";

const TYPES = ["active_directory", "ldap", "kerberos"] as const;

const schema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(255),
    type: z.enum(TYPES, { error: "Choose a type" }),
    dns_ip: z.string().trim().max(255),
    server: z.string().trim().max(255),
    domain: z.string().trim().max(255),
    ou: z.string().trim().max(255),
    user: z.string().trim().max(255),
    password: z.string().max(255),
    confirm_password: z.string().max(255),
    description: z.string().trim().max(255),
  })
  .superRefine((values, ctx) => {
    if (values.password !== values.confirm_password) {
      ctx.addIssue({
        code: "custom",
        path: ["confirm_password"],
        message: "The passwords do not match",
      });
    }
  });
type Values = z.infer<typeof schema>;

// Manila needs the DNS IP, server and domain to create a service (the
// backend rejects empties); an edit may leave them as they are.
const createSchema = schema.superRefine((values, ctx) => {
  for (const field of ["dns_ip", "server", "domain"] as const) {
    if (!values[field]) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: "This field is required",
      });
    }
  }
});

function Fields({
  control,
  withType,
  types,
}: {
  control: ReturnType<typeof useForm<Values>>["control"];
  withType: boolean;
  types: string[];
}) {
  return (
    <>
      <TextInput control={control} name="name" label="Name" isRequired />
      {withType && (
        <SelectInput
          control={control}
          name="type"
          label="Type"
          options={securityServiceTypeOptions(types)}
          isRequired
        />
      )}
      <TextInput
        control={control}
        name="dns_ip"
        label="DNS IP"
        isRequired={withType}
      />
      <TextInput
        control={control}
        name="server"
        label="Server"
        isRequired={withType}
      />
      <TextInput
        control={control}
        name="domain"
        label="Domain"
        isRequired={withType}
      />
      <TextInput control={control} name="ou" label="Organisational unit" />
      <TextInput
        control={control}
        name="user"
        label="User"
        autoComplete="off"
      />
      <TextInput
        control={control}
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
      />
      <TextInput
        control={control}
        name="confirm_password"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
      />
      <TextAreaInput
        control={control}
        name="description"
        label="Description"
        rows={2}
      />
    </>
  );
}

function body(values: Values): SecurityServiceUpdateRequest {
  return {
    name: values.name,
    ...(values.dns_ip ? { dns_ip: values.dns_ip } : {}),
    ...(values.server ? { server: values.server } : {}),
    ...(values.domain ? { domain: values.domain } : {}),
    ...(values.ou ? { ou: values.ou } : {}),
    ...(values.user ? { user: values.user } : {}),
    ...(values.password ? { password: values.password } : {}),
    ...(values.description ? { description: values.description } : {}),
  };
}

export function CreateSecurityServiceDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const create = useCreateSecurityService(projectId);
  const services = useQuery(securityServicesQuery(projectId));
  const form = useForm<Values>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      type: "active_directory",
      dns_ip: "",
      server: "",
      domain: "",
      ou: "",
      user: "",
      password: "",
      confirm_password: "",
      description: "",
    },
  });
  const submit = form.handleSubmit((values) => {
    const request: SecurityServiceCreateRequest = {
      ...body(values),
      name: values.name,
      type: values.type,
      dns_ip: values.dns_ip,
      server: values.server,
      domain: values.domain,
    };
    create.mutate(request, {
      onSuccess: () => {
        notify.success(`Security service ${values.name} created.`);
        onClose();
      },
    });
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Create security service"
      submitLabel="Create"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <Fields
        control={form.control}
        withType
        types={services.data?.types ?? [...TYPES]}
      />
    </FormDialog>
  );
}

export function EditSecurityServiceDialog({
  projectId,
  service,
  onClose,
}: {
  projectId: string;
  service: SecurityService;
  onClose: () => void;
}) {
  const update = useUpdateSecurityService(projectId);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: service.name ?? "",
      type: TYPES.find((t) => t === service.type) ?? "ldap",
      dns_ip: service.dns_ip ?? "",
      server: service.server ?? "",
      domain: service.domain ?? "",
      ou: service.ou ?? "",
      user: service.user ?? "",
      password: "",
      confirm_password: "",
      description: service.description ?? "",
    },
  });
  const submit = form.handleSubmit((values) => {
    update.mutate(
      { id: service.id, ...body(values) },
      {
        onSuccess: () => {
          notify.success(`Security service ${values.name} updated.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Edit ${service.name || service.id}`}
      submitLabel="Save"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
    >
      <Fields control={form.control} withType={false} types={[]} />
    </FormDialog>
  );
}
