// Instance dialogs (trove-dashboard databases/forms.py with the Nectar
// patches): update name and allowed CIDRs, resize volume, resize flavour,
// upgrade datastore version, attach a configuration group, enable root.
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Loading } from "@ardc-ui/react";
import { CodeBlock } from "../../components/CodeBlock/CodeBlock";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import {
  NumberInput,
  SelectInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import type { DbInstance, DbInstanceDetail } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import {
  dbInstanceQuery,
  dbOptionsQuery,
  dbResizeFlavorsQuery,
  dbUpgradeTargetsQuery,
  useAttachConfiguration,
  useEnableRoot,
  useResizeInstance,
  useResizeVolume,
  useUpdateInstance,
  useUpgradeInstance,
} from "./api";
import { CIDR_WARNING, flavorLabel, hasOpenCidr, splitCidrs } from "./status";

const updateSchema = z.object({
  name: z.string().trim().min(1, "Enter an instance name").max(80),
  allowed_cidrs: z.string().refine((v) => splitCidrs(v).length > 0, {
    message: "Enter at least one CIDR",
  }),
});

export function UpdateInstanceDialog({
  projectId,
  instance,
  onClose,
}: {
  projectId: string;
  instance: DbInstance | DbInstanceDetail;
  onClose: () => void;
}) {
  const detail = useQuery(dbInstanceQuery(projectId, instance.id));
  const update = useUpdateInstance(projectId);
  // No default: until the detail loads there is no current value to show,
  // and a failed load must never offer 0.0.0.0/0 as if it were current.
  const cidrs = detail.data?.allowed_cidrs ?? [];
  const form = useForm<z.infer<typeof updateSchema>>({
    resolver: zodResolver(updateSchema),
    values: { name: instance.name ?? "", allowed_cidrs: cidrs.join("\n") },
    resetOptions: { keepDirtyValues: true },
  });
  const typed = useWatch({ control: form.control, name: "allowed_cidrs" });
  const submit = form.handleSubmit((values) => {
    update.mutate(
      {
        id: instance.id,
        name: values.name,
        allowed_cidrs: splitCidrs(values.allowed_cidrs),
      },
      {
        onSuccess: () => {
          notify.success(`Instance ${values.name} is being updated.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Update ${instance.name || instance.id}`}
      submitLabel="Update"
      onSubmit={submit}
      isPending={update.isPending}
      isSubmitDisabled={!detail.isSuccess}
      error={update.error}
    >
      {detail.isPending ? (
        <Loading>Loading instance...</Loading>
      ) : detail.isError ? (
        <ErrorState
          error={detail.error}
          title="Could not load the allowed CIDRs"
          onRetry={() => void detail.refetch()}
        />
      ) : (
        <>
          <TextInput
            control={form.control}
            name="name"
            label="Instance name"
            isRequired
          />
          <TextAreaInput
            control={form.control}
            name="allowed_cidrs"
            label="Allowed CIDRs"
            description="One network per line. Only these networks can reach the database."
            rows={3}
            monospace
            isRequired
          />
          {hasOpenCidr(splitCidrs(typed ?? "")) && (
            <Alert tone="warning" role="status">
              {CIDR_WARNING}
            </Alert>
          )}
        </>
      )}
    </FormDialog>
  );
}

const volumeSchema = z.object({
  size: z.number().int().min(1, "At least 1 GB"),
});

export function ResizeVolumeDialog({
  projectId,
  instance,
  onClose,
}: {
  projectId: string;
  instance: DbInstance;
  onClose: () => void;
}) {
  const resize = useResizeVolume(projectId);
  const current = instance.volume_size ?? 0;
  const form = useForm<z.infer<typeof volumeSchema>>({
    resolver: zodResolver(
      volumeSchema.refine((v) => v.size > current, {
        path: ["size"],
        message: `The new size must be greater than ${current} GB`,
      }),
    ),
    defaultValues: { size: current + 1 },
  });
  const submit = form.handleSubmit((values) => {
    resize.mutate(
      { id: instance.id, size: values.size },
      {
        onSuccess: () => {
          notify.success(
            `Resizing the volume of ${instance.name || instance.id} to ${values.size} GB.`,
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
      title={`Resize volume of ${instance.name || instance.id}`}
      submitLabel="Resize volume"
      onSubmit={submit}
      isPending={resize.isPending}
      error={resize.error}
    >
      <p>The volume is currently {current} GB. Volumes can only grow.</p>
      <NumberInput
        control={form.control}
        name="size"
        label="New size"
        addon="GB"
        minValue={current + 1}
        isRequired
      />
    </FormDialog>
  );
}

const flavorSchema = z.object({
  flavor: z.string().min(1, "Choose a flavour"),
});

export function ResizeInstanceDialog({
  projectId,
  instance,
  onClose,
}: {
  projectId: string;
  instance: DbInstance;
  onClose: () => void;
}) {
  // Only the flavours Trove associates with the instance's datastore
  // version, without the current one (the backend applies the same rule).
  const candidates = useQuery(dbResizeFlavorsQuery(projectId, instance.id));
  const resize = useResizeInstance(projectId);
  const form = useForm<z.infer<typeof flavorSchema>>({
    resolver: zodResolver(flavorSchema),
    defaultValues: { flavor: "" },
  });
  const flavors = candidates.data?.items ?? [];
  const submit = form.handleSubmit((values) => {
    resize.mutate(
      { id: instance.id, flavor: values.flavor },
      {
        onSuccess: () => {
          notify.success(`Resizing ${instance.name || instance.id}.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Resize ${instance.name || instance.id}`}
      submitLabel="Resize instance"
      onSubmit={submit}
      isPending={resize.isPending}
      isSubmitDisabled={flavors.length === 0}
      error={resize.error}
    >
      {candidates.isPending ? (
        <Loading>Loading flavours...</Loading>
      ) : candidates.isError ? (
        <ErrorState
          error={candidates.error}
          title="Could not load flavours"
          onRetry={() => void candidates.refetch()}
        />
      ) : (
        <>
          <p>
            The current flavour is {instance.flavor_name ?? instance.flavor_id}.
            {flavors.length === 0
              ? ` No other flavour is available for ${instance.datastore ?? "this datastore"} ${instance.datastore_version ?? ""}.`
              : ""}
          </p>
          <SelectInput
            control={form.control}
            name="flavor"
            label="New flavour"
            options={flavors.map((f) => ({
              id: f.id ?? "",
              label: flavorLabel(f),
            }))}
            isRequired
          />
        </>
      )}
    </FormDialog>
  );
}

const upgradeSchema = z.object({
  version_id: z.string().min(1, "Choose a version"),
});

export function UpgradeInstanceDialog({
  projectId,
  instance,
  onClose,
}: {
  projectId: string;
  instance: DbInstance;
  onClose: () => void;
}) {
  const targets = useQuery(dbUpgradeTargetsQuery(projectId, instance.id));
  const upgrade = useUpgradeInstance(projectId);
  const form = useForm<z.infer<typeof upgradeSchema>>({
    resolver: zodResolver(upgradeSchema),
    defaultValues: { version_id: "" },
  });
  const items = targets.data?.items ?? [];
  const submit = form.handleSubmit((values) => {
    upgrade.mutate(
      { id: instance.id, versionId: values.version_id },
      {
        onSuccess: () => {
          notify.success(`Upgrading ${instance.name || instance.id}.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Upgrade ${instance.name || instance.id}`}
      submitLabel="Upgrade"
      onSubmit={submit}
      isPending={upgrade.isPending}
      isSubmitDisabled={items.length === 0}
      error={upgrade.error}
    >
      {targets.isPending ? (
        <Loading>Loading versions...</Loading>
      ) : targets.isError ? (
        <ErrorState
          error={targets.error}
          title="Could not load versions"
          onRetry={() => void targets.refetch()}
        />
      ) : (
        <>
          <p>
            The instance runs {instance.datastore}{" "}
            {targets.data?.current ?? instance.datastore_version}.
          </p>
          {items.length === 0 ? (
            <Alert tone="info" role="status">
              No new versions available.
            </Alert>
          ) : (
            <SelectInput
              control={form.control}
              name="version_id"
              label="New version"
              placeholder="Select a new version"
              options={items.map((t) => ({
                id: t.version_id ?? "",
                label: t.label,
              }))}
              isRequired
            />
          )}
        </>
      )}
    </FormDialog>
  );
}

const attachSchema = z.object({
  configuration_id: z.string().min(1, "Choose a configuration group"),
});

export function AttachConfigurationDialog({
  projectId,
  instance,
  onClose,
}: {
  projectId: string;
  instance: DbInstance;
  onClose: () => void;
}) {
  const options = useQuery(dbOptionsQuery(projectId));
  const attach = useAttachConfiguration(projectId);
  const form = useForm<z.infer<typeof attachSchema>>({
    resolver: zodResolver(attachSchema),
    defaultValues: { configuration_id: "" },
  });
  const groups = (options.data?.configurations ?? []).filter(
    (c) =>
      c.datastore === instance.datastore &&
      c.datastore_version === instance.datastore_version,
  );
  const submit = form.handleSubmit((values) => {
    attach.mutate(
      { id: instance.id, configurationId: values.configuration_id },
      {
        onSuccess: () => {
          notify.success(
            `Configuration group attached to ${instance.name || instance.id}.`,
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
      title={`Attach configuration group to ${instance.name || instance.id}`}
      submitLabel="Attach"
      onSubmit={submit}
      isPending={attach.isPending}
      isSubmitDisabled={groups.length === 0}
      error={attach.error}
    >
      {options.isPending ? (
        <Loading>Loading configuration groups...</Loading>
      ) : options.isError ? (
        <ErrorState
          error={options.error}
          title="Could not load configuration groups"
          onRetry={() => void options.refetch()}
        />
      ) : groups.length === 0 ? (
        <Alert tone="info" role="status">
          No configuration groups exist for {instance.datastore}{" "}
          {instance.datastore_version}.
        </Alert>
      ) : (
        <SelectInput
          control={form.control}
          name="configuration_id"
          label="Configuration group"
          options={groups.map((g) => ({ id: g.id, label: g.name || g.id }))}
          isRequired
        />
      )}
    </FormDialog>
  );
}

export function EnableRootDialog({
  projectId,
  instance,
  onClose,
}: {
  projectId: string;
  instance: DbInstance;
  onClose: () => void;
}) {
  const enable = useEnableRoot(projectId);
  const form = useForm<Record<string, never>>({ defaultValues: {} });
  const submit = form.handleSubmit(() => {
    enable.mutate(instance.id, {
      onSuccess: () =>
        notify.success("Root access enabled. Copy the password now."),
    });
  });
  if (enable.data) {
    return (
      <FormDialog
        isOpen
        onOpenChange={(open) => !open && onClose()}
        title="Root password"
        submitLabel="Done"
        onSubmit={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <p>This password is shown once. Store it somewhere safe.</p>
        <CodeBlock
          text={`${enable.data.name ?? "root"}:${enable.data.password ?? ""}`}
          label="Root credentials"
        />
      </FormDialog>
    );
  }
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Enable root on ${instance.name || instance.id}`}
      submitLabel="Enable root"
      onSubmit={submit}
      isPending={enable.isPending}
      error={enable.error}
    >
      <p>
        A root (superuser) account is created with a generated password.
        Enabling it again resets the password.
      </p>
    </FormDialog>
  );
}
