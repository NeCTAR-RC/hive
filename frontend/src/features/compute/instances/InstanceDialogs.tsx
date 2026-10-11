// The dialogs behind the instance actions that need input: edit, resize,
// rebuild, snapshot, metadata, security groups, attach and detach
// interface. Opened by useInstanceActions.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Alert, Button } from "@ardc-ui/react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import {
  CheckboxesInput,
  RadioInput,
  SelectInput,
  TextInput,
} from "../../../components/Form/fields";
import type { Instance } from "../../../lib/api/types";
import { formatMb, formatSuRate } from "../../../lib/format";
import { notify } from "../../../lib/notify";
import {
  attachablePortsQuery,
  networksQuery,
  securityGroupsQuery,
  useDisassociateFloatingIp,
} from "../../network/api";
import {
  instancePortsQuery,
  launchOptionsQuery,
  resizeFlavorsQuery,
  useInstanceAction,
  useUpdateInstance,
} from "../api";
import styles from "./InstanceActions.module.scss";

interface DialogProps {
  projectId: string;
  instance: Instance;
  onClose: () => void;
}

// --- edit -----------------------------------------------------------------------

const editSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(255),
  description: z.string().trim().max(255, "At most 255 characters"),
});

export function EditDialog({ projectId, instance, onClose }: DialogProps) {
  const update = useUpdateInstance(projectId);
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: instance.name,
      description: instance.description ?? "",
    },
  });
  const submit = form.handleSubmit((values) => {
    update.mutate(
      {
        instanceId: instance.id,
        name: values.name,
        description: values.description,
      },
      {
        onSuccess: () => {
          notify.success(`Instance ${values.name} updated.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Edit instance"
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

// --- resize ---------------------------------------------------------------------

const resizeSchema = z.object({
  flavor_id: z.string().min(1, "Choose a flavour"),
});

export function ResizeDialog({ projectId, instance, onClose }: DialogProps) {
  const flavors = useQuery(resizeFlavorsQuery(projectId, instance.id));
  const action = useInstanceAction(projectId);
  const form = useForm<z.infer<typeof resizeSchema>>({
    resolver: zodResolver(resizeSchema),
    defaultValues: { flavor_id: "" },
  });
  const chosen = useWatch({ control: form.control, name: "flavor_id" });
  const flavor = flavors.data?.items.find((f) => f.id === chosen);
  const options = (flavors.data?.items ?? []).map((f) => ({
    id: f.id,
    label: `${f.name} (${f.vcpus ?? "?"} vCPU, ${formatMb(f.ram_mb)}${f.su_rate !== null ? `, ${formatSuRate(f.su_rate)}` : ""})`,
  }));
  const submit = form.handleSubmit((values) => {
    action.mutate(
      {
        instanceId: instance.id,
        action: "resize",
        body: { flavor_id: values.flavor_id },
      },
      {
        onSuccess: () => {
          notify.success(
            `Resize of ${instance.name} started. Confirm it once the instance reports "verify resize".`,
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
      title={`Resize ${instance.name}`}
      submitLabel="Resize"
      onSubmit={submit}
      isPending={action.isPending}
      error={action.error ?? flavors.error}
    >
      <p>
        Current flavour: <strong>{instance.flavor?.name ?? "unknown"}</strong>
        {instance.flavor?.su_rate !== null &&
        instance.flavor?.su_rate !== undefined
          ? ` (${formatSuRate(instance.flavor.su_rate)})`
          : ""}
        . The instance reboots as part of the resize.
      </p>
      <SelectInput
        control={form.control}
        name="flavor_id"
        label="New flavour"
        options={options}
        isRequired
        isDisabled={flavors.isPending}
        placeholder={
          flavors.isPending ? "Loading flavours..." : "Choose a flavour"
        }
      />
      {flavor?.is_preemptible && (
        <Alert tone="warning" role="status">
          Preemptible instances have a maximum lifetime of 24 hours and may be
          stopped at any time.
        </Alert>
      )}
    </FormDialog>
  );
}

// --- rebuild --------------------------------------------------------------------

const rebuildSchema = z.object({
  image_id: z.string().min(1, "Choose an image"),
  name: z.string().trim().max(255),
  password: z.string().max(255),
});

export function RebuildDialog({ projectId, instance, onClose }: DialogProps) {
  const options = useQuery(launchOptionsQuery(projectId));
  const action = useInstanceAction(projectId);
  const form = useForm<z.infer<typeof rebuildSchema>>({
    resolver: zodResolver(rebuildSchema),
    defaultValues: { image_id: "", name: "", password: "" },
  });
  const images = useMemo(() => {
    const all = [
      ...(options.data?.images ?? []),
      ...(options.data?.snapshots ?? []),
    ];
    return all
      .filter(
        (image) =>
          !image.hidden_until_search || image.id === instance.image?.id,
      )
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
      .map((image) => ({
        id: image.id,
        label: `${image.name ?? image.id}${image.is_snapshot ? " (snapshot)" : ""}`,
      }));
  }, [options.data, instance.image?.id]);
  const submit = form.handleSubmit((values) => {
    const body: Record<string, unknown> = { image_id: values.image_id };
    if (values.name) body["name"] = values.name;
    if (values.password) body["password"] = values.password;
    action.mutate(
      { instanceId: instance.id, action: "rebuild", body },
      {
        onSuccess: () => {
          notify.success(`Rebuild of ${instance.name} started.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Rebuild ${instance.name}`}
      submitLabel="Rebuild"
      submitTone="danger"
      onSubmit={submit}
      isPending={action.isPending}
      error={action.error ?? options.error}
    >
      <Alert tone="warning" role="status">
        Rebuilding replaces the instance's disk with a fresh copy of the chosen
        image. Everything stored on the instance is lost.
      </Alert>
      <SelectInput
        control={form.control}
        name="image_id"
        label="Image"
        options={images}
        isRequired
        isDisabled={options.isPending}
        placeholder={
          options.isPending ? "Loading images..." : "Choose an image"
        }
      />
      <TextInput
        control={form.control}
        name="name"
        label="New name"
        description="Leave blank to keep the current name."
      />
      <TextInput
        control={form.control}
        name="password"
        label="Admin password"
        type="password"
        autoComplete="new-password"
        description="Optional; only images that support password injection use it."
      />
    </FormDialog>
  );
}

// --- snapshot -------------------------------------------------------------------

const snapshotSchema = z.object({
  name: z.string().trim().min(1, "Enter a name for the snapshot").max(255),
});

export function SnapshotDialog({ projectId, instance, onClose }: DialogProps) {
  const action = useInstanceAction(projectId);
  const navigate = useNavigate();
  const form = useForm<z.infer<typeof snapshotSchema>>({
    resolver: zodResolver(snapshotSchema),
    defaultValues: { name: `${instance.name}-snapshot` },
  });
  const submit = form.handleSubmit((values) => {
    action.mutate(
      {
        instanceId: instance.id,
        action: "snapshot",
        body: { name: values.name },
      },
      {
        onSuccess: () => {
          notify.success(`Snapshot ${values.name} is being created.`);
          onClose();
          void navigate({ to: "/compute/images", search: { snapshots: true } });
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Create snapshot of ${instance.name}`}
      submitLabel="Create snapshot"
      onSubmit={submit}
      isPending={action.isPending}
      error={action.error}
    >
      <p>
        A snapshot is an image of the instance's disk you can launch new
        instances from. It appears under Images once it has been uploaded.
      </p>
      <TextInput
        control={form.control}
        name="name"
        label="Snapshot name"
        isRequired
      />
    </FormDialog>
  );
}

// --- metadata -------------------------------------------------------------------

const metadataSchema = z.object({
  entries: z
    .array(
      z.object({
        key: z.string().trim().min(1, "Enter a key").max(255),
        value: z.string().max(255, "At most 255 characters"),
      }),
    )
    .refine(
      (entries) => new Set(entries.map((e) => e.key)).size === entries.length,
      { message: "Keys must be unique" },
    ),
});

type MetadataForm = z.infer<typeof metadataSchema>;

export function MetadataDialog({ projectId, instance, onClose }: DialogProps) {
  const action = useInstanceAction(projectId);
  const form = useForm<MetadataForm>({
    resolver: zodResolver(metadataSchema),
    defaultValues: {
      entries: Object.entries(instance.metadata).map(([key, value]) => ({
        key,
        value,
      })),
    },
  });
  const entries = useFieldArray({ control: form.control, name: "entries" });
  const rootError = form.formState.errors.entries?.root?.message;
  const submit = form.handleSubmit((values) => {
    const metadata = Object.fromEntries(
      values.entries.map((entry) => [entry.key, entry.value]),
    );
    action.mutate(
      {
        instanceId: instance.id,
        action: "update-metadata",
        body: { metadata },
      },
      {
        onSuccess: () => {
          notify.success(`Metadata of ${instance.name} updated.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Update metadata of ${instance.name}`}
      submitLabel="Save"
      size="lg"
      onSubmit={submit}
      isPending={action.isPending}
      error={action.error}
    >
      {rootError && (
        <Alert tone="danger" role="alert">
          {rootError}
        </Alert>
      )}
      {entries.fields.length === 0 && <p>No metadata is set.</p>}
      <div className={styles.metadata}>
        {entries.fields.map((field, index) => (
          <div key={field.id} className={styles.metadataRow}>
            <TextInput
              control={form.control}
              name={`entries.${index}.key`}
              label="Key"
              isRequired
            />
            <TextInput
              control={form.control}
              name={`entries.${index}.value`}
              label="Value"
            />
            <Button
              variant="link"
              size="xs"
              className={styles.removeRow}
              onPress={() => entries.remove(index)}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      <div>
        <Button
          variant="secondary"
          size="xs"
          iconBefore="plus"
          onPress={() => entries.append({ key: "", value: "" })}
        >
          Add metadata
        </Button>
      </div>
    </FormDialog>
  );
}

// --- security groups ---------------------------------------------------------------

const groupsSchema = z.object({ groups: z.array(z.string()) });

export function SecurityGroupsDialog({
  projectId,
  instance,
  onClose,
}: DialogProps) {
  const groups = useQuery(securityGroupsQuery(projectId));
  const action = useInstanceAction(projectId);
  const form = useForm<z.infer<typeof groupsSchema>>({
    resolver: zodResolver(groupsSchema),
    defaultValues: { groups: instance.security_groups },
  });
  const options = (groups.data?.items ?? []).map((group) => ({
    id: group.name,
    label: group.description
      ? `${group.name}: ${group.description}`
      : group.name,
  }));
  const submit = form.handleSubmit(async (values) => {
    const before = new Set(instance.security_groups);
    const after = new Set(values.groups);
    const added = values.groups.filter((name) => !before.has(name));
    const removed = instance.security_groups.filter((name) => !after.has(name));
    if (added.length === 0 && removed.length === 0) {
      onClose();
      return;
    }
    try {
      for (const name of added) {
        await action.mutateAsync({
          instanceId: instance.id,
          action: "add-security-group",
          body: { security_group: name },
        });
      }
      for (const name of removed) {
        await action.mutateAsync({
          instanceId: instance.id,
          action: "remove-security-group",
          body: { security_group: name },
        });
      }
      notify.success(`Security groups of ${instance.name} updated.`);
      onClose();
    } catch {
      // The mutation error is shown in the dialog.
    }
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Security groups of ${instance.name}`}
      submitLabel="Save"
      size="lg"
      onSubmit={submit}
      isPending={action.isPending}
      error={action.error ?? groups.error}
    >
      {groups.isPending ? (
        <p>Loading security groups...</p>
      ) : (
        <CheckboxesInput
          control={form.control}
          name="groups"
          label="Security groups"
          description="Applied to every port of the instance."
          options={options}
        />
      )}
    </FormDialog>
  );
}

// --- interfaces -------------------------------------------------------------------

const attachSchema = z
  .object({
    mode: z.enum(["network", "port"]),
    network_id: z.string(),
    port_id: z.string(),
  })
  .refine(
    (v) =>
      v.mode === "network" ? v.network_id.length > 0 : v.port_id.length > 0,
    {
      message: "Choose a network or a port",
      path: ["network_id"],
    },
  );

export function AttachInterfaceDialog({
  projectId,
  instance,
  onClose,
}: DialogProps) {
  const networks = useQuery(networksQuery(projectId, "boot"));
  const ports = useQuery(attachablePortsQuery(projectId));
  const action = useInstanceAction(projectId);
  const form = useForm<z.infer<typeof attachSchema>>({
    resolver: zodResolver(attachSchema),
    defaultValues: { mode: "network", network_id: "", port_id: "" },
  });
  const mode = useWatch({ control: form.control, name: "mode" });
  const submit = form.handleSubmit((values) => {
    const body =
      values.mode === "network"
        ? { network_id: values.network_id }
        : { port_id: values.port_id };
    action.mutate(
      { instanceId: instance.id, action: "attach-interface", body },
      {
        onSuccess: () => {
          notify.success(`Interface attached to ${instance.name}.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Attach interface to ${instance.name}`}
      submitLabel="Attach interface"
      onSubmit={submit}
      isPending={action.isPending}
      error={action.error ?? networks.error ?? ports.error}
    >
      <RadioInput
        control={form.control}
        name="mode"
        label="Attach by"
        options={[
          { id: "network", label: "Network (a new port is created)" },
          { id: "port", label: "Existing port" },
        ]}
      />
      {mode === "network" ? (
        <SelectInput
          control={form.control}
          name="network_id"
          label="Network"
          options={(networks.data?.items ?? []).map((n) => ({
            id: n.id,
            label: n.name,
          }))}
          isRequired
          isDisabled={networks.isPending}
          placeholder={
            networks.isPending ? "Loading networks..." : "Choose a network"
          }
        />
      ) : (
        <SelectInput
          control={form.control}
          name="port_id"
          label="Port"
          options={(ports.data?.items ?? []).map((p) => ({
            id: p.id,
            label: `${p.name || p.id} (${p.network_name ?? "network"}: ${p.fixed_ips.join(", ") || "no address"})`,
          }))}
          isRequired
          isDisabled={ports.isPending}
          placeholder={ports.isPending ? "Loading ports..." : "Choose a port"}
        />
      )}
    </FormDialog>
  );
}

const detachSchema = z.object({ port_id: z.string().min(1, "Choose a port") });

export function DetachInterfaceDialog({
  projectId,
  instance,
  onClose,
}: DialogProps) {
  const ports = useQuery(instancePortsQuery(projectId, instance.id));
  const action = useInstanceAction(projectId);
  const form = useForm<z.infer<typeof detachSchema>>({
    resolver: zodResolver(detachSchema),
    defaultValues: { port_id: "" },
  });
  const submit = form.handleSubmit((values) => {
    action.mutate(
      {
        instanceId: instance.id,
        action: "detach-interface",
        body: { port_id: values.port_id },
      },
      {
        onSuccess: () => {
          notify.success(`Interface detached from ${instance.name}.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Detach interface from ${instance.name}`}
      submitLabel="Detach interface"
      submitTone="danger"
      onSubmit={submit}
      isPending={action.isPending}
      error={action.error ?? ports.error}
    >
      <SelectInput
        control={form.control}
        name="port_id"
        label="Interface"
        options={(ports.data?.items ?? []).map((p) => ({
          id: p.id,
          label: `${p.fixed_ips.map((ip) => ip.ip).join(", ") || p.id}${p.floating_ips.length ? ` (floating ${p.floating_ips.map((f) => f.address).join(", ")})` : ""}`,
        }))}
        isRequired
        isDisabled={ports.isPending}
        placeholder={
          ports.isPending ? "Loading interfaces..." : "Choose an interface"
        }
      />
    </FormDialog>
  );
}

// --- disassociate floating IP ---------------------------------------------

const disassociateSchema = z.object({
  floating_ip_id: z.string().min(1, "Choose a floating IP"),
});

/** Horizon's DisassociateIP from the instance menu: pick which of the
 * instance's floating IPs to detach (preselected when there is one). */
export function DisassociateFloatingIpDialog({
  projectId,
  instance,
  onClose,
}: DialogProps) {
  const ports = useQuery(instancePortsQuery(projectId, instance.id));
  const disassociate = useDisassociateFloatingIp(projectId);
  const floating = useMemo(
    () =>
      (ports.data?.items ?? []).flatMap((p) =>
        p.floating_ips.map((f) => ({
          id: f.id,
          label: `${f.address} on ${p.fixed_ips.map((ip) => ip.ip).join(", ") || p.id}`,
        })),
      ),
    [ports.data],
  );
  const form = useForm<z.infer<typeof disassociateSchema>>({
    resolver: zodResolver(disassociateSchema),
    defaultValues: { floating_ip_id: "" },
  });
  if (
    floating.length === 1 &&
    floating[0] &&
    form.getValues("floating_ip_id") === "" &&
    !form.formState.dirtyFields.floating_ip_id
  ) {
    form.setValue("floating_ip_id", floating[0].id);
  }
  const submit = form.handleSubmit((values) => {
    const chosen = floating.find((f) => f.id === values.floating_ip_id);
    disassociate.mutate(values.floating_ip_id, {
      onSuccess: () => {
        notify.success(
          `Disassociated floating IP ${chosen?.label.split(" ")[0] ?? ""} from ${instance.name}.`,
        );
        onClose();
      },
    });
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Disassociate floating IP from ${instance.name}`}
      submitLabel="Disassociate"
      submitTone="danger"
      onSubmit={submit}
      isPending={disassociate.isPending}
      error={disassociate.error ?? ports.error}
    >
      <SelectInput
        control={form.control}
        name="floating_ip_id"
        label="Floating IP"
        options={floating}
        isRequired
        isDisabled={ports.isPending || floating.length === 0}
        placeholder={
          ports.isPending
            ? "Loading floating IPs..."
            : floating.length === 0
              ? "No floating IP is associated"
              : "Choose a floating IP"
        }
        description="The address stays allocated to the project."
      />
    </FormDialog>
  );
}
