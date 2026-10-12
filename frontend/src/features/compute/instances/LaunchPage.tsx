// The launch wizard. One react-hook-form across seven steps, each validated
// on Next; the Nectar rules (AZ required, classic network first and
// preselected, otherwise only a sole network, community images hidden until
// searched, SU per hour and the preemptible notice on flavours) come from
// the backend's launch options.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import {
  Alert,
  Button,
  Cell,
  Column,
  Label,
  RadioGroup,
  RadioGroupItem,
  Row,
  SearchField,
  StepItem,
  Stepper,
  Table,
  TableBody,
  TableHeader,
  Text,
} from "@ardc-ui/react";
import type { Selection } from "@ardc-ui/react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import type { FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import {
  CheckboxesInput,
  NumberInput,
  RadioInput,
  SelectInput,
  SwitchInput,
  TextAreaInput,
  TextInput,
} from "../../../components/Form/fields";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type {
  Flavor,
  Image,
  LaunchOptions,
  LaunchRequest,
  LaunchSourceType,
} from "../../../lib/api/types";
import {
  formatBytes,
  formatGb,
  formatMb,
  formatNumber,
  formatSuRate,
} from "../../../lib/format";
import { notify } from "../../../lib/notify";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { launchRoute } from "../../../app/router";
import { attachablePortsQuery } from "../../network/api";
import { launchOptionsQuery, useLaunch } from "../api";
import {
  CreateKeyPairDialog,
  ImportKeyPairDialog,
} from "../keypairs/KeyPairDialogs";
import { defaultNetworkIds } from "./launch";
import styles from "./LaunchPage.module.scss";

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter an instance name")
      .max(255, "At most 255 characters"),
    description: z.string().trim().max(255, "At most 255 characters"),
    availability_zone: z.string().min(1, "Choose an availability zone"),
    count: z
      .number({ message: "Enter how many instances to launch" })
      .int()
      .min(1, "At least 1")
      .max(100, "At most 100"),
    source_type: z.enum(["image", "snapshot", "volume", "volume_snapshot"]),
    source_id: z.string().min(1, "Choose a source"),
    delete_volume_on_termination: z.boolean(),
    flavor_id: z.string().min(1, "Choose a flavour"),
    networks: z.array(z.string()),
    ports: z.array(z.string()),
    security_groups: z.array(z.string()),
    key_name: z.string(),
    user_data: z.string().max(65535, "User data is limited to 64 KB"),
    server_group_id: z.string(),
    metadata: z.array(
      z.object({
        key: z.string().trim().min(1, "Enter a key").max(255),
        value: z.string().max(255),
      }),
    ),
  })
  .refine((v) => v.networks.length + v.ports.length > 0, {
    message: "Choose at least one network or port",
    path: ["networks"],
  });

type LaunchForm = z.infer<typeof schema>;

interface Step {
  id: string;
  title: string;
  fields: FieldPath<LaunchForm>[];
}

const STEPS: Step[] = [
  {
    id: "details",
    title: "Details",
    fields: ["name", "description", "availability_zone", "count"],
  },
  { id: "source", title: "Source", fields: ["source_type", "source_id"] },
  { id: "flavor", title: "Flavour", fields: ["flavor_id"] },
  { id: "networks", title: "Networks", fields: ["networks", "ports"] },
  { id: "security", title: "Security groups", fields: ["security_groups"] },
  { id: "keypair", title: "Key pair", fields: ["key_name"] },
  {
    id: "config",
    title: "Configuration",
    fields: [
      "user_data",
      "server_group_id",
      "metadata",
      "delete_volume_on_termination",
    ],
  },
];

const NONE = "__none__";

const SECTION_LABELS: Record<string, string> = {
  flavors: "Flavours",
  images: "Images",
  volumes: "Volumes",
  networks: "Networks",
  key_pairs: "Key pairs",
  security_groups: "Security groups",
  availability_zones: "Availability zones",
  server_groups: "Server groups",
  limits: "Quota",
};

function parseSource(
  value: string | undefined,
): { type: LaunchSourceType; id: string } | null {
  if (!value) return null;
  const [type, id] = value.split(":", 2);
  if (!id) return null;
  if (!["image", "snapshot", "volume", "volume_snapshot"].includes(type ?? ""))
    return null;
  return { type: type as LaunchSourceType, id };
}

export function LaunchPage() {
  const projectId = useProjectId();
  const search = launchRoute.useSearch();
  const navigate = useNavigate();
  const options = useQuery(launchOptionsQuery(projectId));
  const launch = useLaunch(projectId);
  const [step, setStep] = useState(0);
  const [keyPairDialog, setKeyPairDialog] = useState<KeyPairDialogMode>(null);
  const [launched, setLaunched] = useState(false);

  const form = useForm<LaunchForm>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      description: "",
      availability_zone: "",
      count: 1,
      source_type: "image",
      source_id: "",
      delete_volume_on_termination: false,
      flavor_id: "",
      networks: [],
      ports: [],
      security_groups: [],
      key_name: "",
      user_data: "",
      server_group_id: "",
      metadata: [],
    },
  });

  const count = useWatch({ control: form.control, name: "count" });

  // Once the options arrive, apply Nectar's defaults and any deep link.
  const applied = useRef(false);
  useEffect(() => {
    const data = options.data;
    if (!data || applied.current) return;
    applied.current = true;
    const source = parseSource(search.source);
    const keyPairs = data.key_pairs ?? [];
    form.reset({
      ...form.getValues(),
      source_type: source?.type ?? "image",
      source_id: source?.id ?? "",
      flavor_id:
        search.flavor && data.flavors?.some((f) => f.id === search.flavor)
          ? search.flavor
          : "",
      networks: defaultNetworkIds(data.networks),
      security_groups: data.security_groups?.some((g) => g.name === "default")
        ? ["default"]
        : [],
      key_name: keyPairs.length === 1 ? (keyPairs[0]?.name ?? "") : "",
    });
  }, [options.data, search.source, search.flavor, form]);

  // Leave once the launch is accepted; by then the blocker lets us go.
  useEffect(() => {
    if (launched) void navigate({ to: "/compute/instances", search: {} });
  }, [launched, navigate]);

  const blocker = useBlocker({
    shouldBlockFn: () => form.formState.isDirty && !launched,
    enableBeforeUnload: () => form.formState.isDirty && !launched,
    withResolver: true,
  });

  const next = async () => {
    const current = STEPS[step];
    if (!current) return;
    const valid = await form.trigger(current.fields, { shouldFocus: true });
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submit = form.handleSubmit(
    (values) => {
      const request: LaunchRequest = {
        name: values.name,
        count: values.count,
        source: { type: values.source_type, id: values.source_id },
        flavor_id: values.flavor_id,
        availability_zone: values.availability_zone,
        networks: values.networks,
        ports: values.ports,
        security_groups: values.security_groups,
        key_name:
          values.key_name && values.key_name !== NONE ? values.key_name : null,
        user_data: values.user_data || null,
        metadata: Object.fromEntries(
          values.metadata.map((m) => [m.key, m.value]),
        ),
        description: values.description || null,
        server_group_id:
          values.server_group_id && values.server_group_id !== NONE
            ? values.server_group_id
            : null,
        delete_volume_on_termination: values.delete_volume_on_termination,
      };
      launch.mutate(request, {
        onSuccess: (result) => {
          setLaunched(true);
          const n = result.ids.length || values.count;
          notify.success(
            n === 1
              ? `Instance ${values.name} is launching.`
              : `${n} instances are launching.`,
          );
        },
      });
    },
    (errors) => {
      // Jump to the first step with an error.
      const index = STEPS.findIndex((s) =>
        s.fields.some((f) => f.split(".")[0]! in errors),
      );
      if (index >= 0) setStep(index);
    },
  );

  const data = options.data;
  const sectionErrors = Object.entries(data?.errors ?? {});
  const current = STEPS[step]!;

  return (
    <>
      <PageHeader
        title="Launch instance"
        crumbs={[
          { label: "Project" },
          { label: "Compute" },
          { label: "Instances", href: "/compute/instances" },
        ]}
      />
      {options.isError ? (
        <ErrorState
          error={options.error}
          onRetry={() => void options.refetch()}
        />
      ) : (
        <form
          // Enter advances a step; only the Launch button submits, and it is a
          // plain button so a Next press can never land on it mid-swap.
          onSubmit={(event) => {
            event.preventDefault();
            if (step === STEPS.length - 1) void submit();
            else void next();
          }}
          noValidate
          className={styles.layout}
        >
          <div className={styles.main}>
            {sectionErrors.length > 0 && (
              <Alert tone="warning" role="status">
                Some options could not be loaded:{" "}
                {sectionErrors
                  .map(
                    ([key, error]) =>
                      `${SECTION_LABELS[key] ?? key} (${error.message})`,
                  )
                  .join("; ")}
                . You can still launch with what is available.
              </Alert>
            )}
            <QuotaWarning data={data} count={count} />
            <Stepper
              activeStep={current.id}
              onActiveStepChange={(key) => {
                const index = STEPS.findIndex((s) => s.id === key);
                if (index >= 0 && index < step) setStep(index);
              }}
              allowsJumping
              aria-label="Launch steps"
            >
              {STEPS.map((s) => (
                <StepItem key={s.id} id={s.id} title={s.title}>
                  {options.isPending || !data ? (
                    <SkeletonLines lines={6} />
                  ) : (
                    <StepBody
                      id={s.id}
                      form={form}
                      data={data}
                      projectId={projectId}
                      onOpenKeyPairDialog={setKeyPairDialog}
                    />
                  )}
                </StepItem>
              ))}
            </Stepper>
            {launch.isError && (
              <ErrorState error={launch.error} title="Launch failed" />
            )}
            <div className={styles.buttons}>
              <Button
                variant="secondary"
                onPress={back}
                isDisabled={step === 0 || launch.isPending}
              >
                Back
              </Button>
              {step < STEPS.length - 1 ? (
                <Button
                  onPress={() => void next()}
                  isDisabled={options.isPending}
                >
                  Next
                </Button>
              ) : launch.isPending ? (
                <Button state="loading" loadingText="Launching..." isDisabled>
                  Launch
                </Button>
              ) : (
                <Button onPress={() => void submit()}>Launch</Button>
              )}
            </div>
          </div>
          <Summary form={form} data={data} />
        </form>
      )}
      <ConfirmDialog
        isOpen={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
        title="Leave without launching?"
        confirmLabel="Leave"
        onConfirm={() => blocker.proceed?.()}
      >
        <p>Your choices on this page will be lost.</p>
      </ConfirmDialog>
      <KeyPairDialogs
        projectId={projectId}
        form={form}
        mode={keyPairDialog}
        onOpenChange={setKeyPairDialog}
      />
    </>
  );
}

type FormApi = ReturnType<typeof useForm<LaunchForm>>;

function QuotaWarning({
  data,
  count,
}: {
  data: LaunchOptions | undefined;
  count: number;
}) {
  const limits = data?.limits;
  if (
    !limits ||
    limits.maxTotalInstances === undefined ||
    limits.maxTotalInstances < 0
  ) {
    return null;
  }
  const used = limits.totalInstancesUsed ?? 0;
  const remaining = limits.maxTotalInstances - used;
  if (count <= remaining) return null;
  return (
    <Alert tone="warning" role="status">
      Your project can launch {remaining} more{" "}
      {remaining === 1 ? "instance" : "instances"} ({used} of{" "}
      {limits.maxTotalInstances} in use). Reduce the count or free up quota.
    </Alert>
  );
}

function StepBody({
  id,
  form,
  data,
  projectId,
  onOpenKeyPairDialog,
}: {
  id: string;
  form: FormApi;
  data: LaunchOptions;
  projectId: string;
  onOpenKeyPairDialog: (mode: KeyPairDialogMode) => void;
}) {
  switch (id) {
    case "details":
      return <DetailsStep form={form} data={data} />;
    case "source":
      return <SourceStep form={form} data={data} />;
    case "flavor":
      return <FlavorStep form={form} data={data} />;
    case "networks":
      return <NetworksStep form={form} data={data} projectId={projectId} />;
    case "security":
      return <SecurityStep form={form} data={data} />;
    case "keypair":
      return (
        <KeyPairStep
          form={form}
          data={data}
          onOpenDialog={onOpenKeyPairDialog}
        />
      );
    case "config":
      return <ConfigStep form={form} data={data} />;
    default:
      return null;
  }
}

function DetailsStep({ form, data }: { form: FormApi; data: LaunchOptions }) {
  const zones = (data.availability_zones ?? []).map((zone) => ({
    id: zone.name,
    label: zone.available ? zone.name : `${zone.name} (unavailable)`,
    isDisabled: !zone.available,
  }));
  return (
    <div className={styles.fields}>
      <TextInput
        control={form.control}
        name="name"
        label="Instance name"
        isRequired
      />
      <TextInput
        control={form.control}
        name="description"
        label="Description"
      />
      <SelectInput
        control={form.control}
        name="availability_zone"
        label="Availability zone"
        description="Where the instance runs. Volumes can only attach to instances in their own zone."
        options={zones}
        isRequired
        placeholder="Choose a zone"
      />
      <NumberInput
        control={form.control}
        name="count"
        label="Count"
        description="How many identical instances to launch."
        minValue={1}
        maxValue={100}
        isRequired
      />
    </div>
  );
}

const SOURCE_TYPES: { id: LaunchSourceType; label: string }[] = [
  { id: "image", label: "Image" },
  { id: "snapshot", label: "Instance snapshot" },
  { id: "volume", label: "Volume" },
  { id: "volume_snapshot", label: "Volume snapshot" },
];

const MAX_LISTED = 200;

function SourceStep({ form, data }: { form: FormApi; data: LaunchOptions }) {
  const [query, setQuery] = useState("");
  const type = useWatch({ control: form.control, name: "source_type" });
  const zone = useWatch({ control: form.control, name: "availability_zone" });
  const chosen = useWatch({ control: form.control, name: "source_id" });
  const needle = query.trim().toLowerCase();

  const items = useMemo(() => {
    const matches = (name: string | null | undefined) =>
      !needle || (name ?? "").toLowerCase().includes(needle);
    if (type === "image" || type === "snapshot") {
      const list = (type === "image" ? data.images : data.snapshots) ?? [];
      return list
        .filter((image) => (needle ? true : !image.hidden_until_search))
        .filter((image) => matches(image.name))
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
        .map((image) => ({
          id: image.id,
          name: image.name ?? image.id,
          meta: imageMeta(image),
        }));
    }
    if (type === "volume") {
      return (data.volumes ?? [])
        .filter(
          (volume) =>
            !zone ||
            !volume.availability_zone ||
            volume.availability_zone === zone,
        )
        .filter((volume) => matches(volume.name))
        .map((volume) => ({
          id: volume.id,
          name: volume.name,
          meta: `${formatGb(volume.size_gb)}${volume.availability_zone ? `, ${volume.availability_zone}` : ""}`,
        }));
    }
    return (data.volume_snapshots ?? [])
      .filter((snapshot) => matches(snapshot.name))
      .map((snapshot) => ({
        id: snapshot.id,
        name: snapshot.name,
        meta: formatGb(snapshot.size_gb),
      }));
  }, [type, needle, zone, data]);

  const listed = items.slice(0, MAX_LISTED);
  const hiddenCommunity =
    type === "image" &&
    !needle &&
    (data.images ?? []).some((i) => i.hidden_until_search);
  const error = form.formState.errors.source_id?.message;

  return (
    <div className={styles.fields}>
      <RadioInput
        control={form.control}
        name="source_type"
        label="Boot source"
        options={SOURCE_TYPES.map((option) => ({
          ...option,
          isDisabled:
            (option.id === "volume" && !data.volumes) ||
            (option.id === "volume_snapshot" && !data.volume_snapshots) ||
            (option.id === "snapshot" && !data.snapshots),
        }))}
      />
      <SearchField
        size="sm"
        aria-label="Search sources"
        value={query}
        onChange={setQuery}
        placeholder={
          type === "image"
            ? "Search images (community images appear when you search)"
            : "Search"
        }
        className={styles.search}
      />
      {hiddenCommunity && (
        <p className={styles.hint}>
          Community images shared by other projects are shown once you search
          for them.
        </p>
      )}
      <RadioGroup
        aria-label="Source"
        value={chosen}
        onChange={(value) =>
          form.setValue("source_id", value, {
            shouldValidate: true,
            shouldDirty: true,
          })
        }
        isInvalid={Boolean(error)}
        className={styles.sourceList}
      >
        {listed.length === 0 && <p className={styles.hint}>Nothing matches.</p>}
        {listed.map((item) => (
          <RadioGroupItem key={item.id} value={item.id}>
            <span className={styles.sourceName}>{item.name}</span>
            <span className={styles.sourceMeta}>{item.meta}</span>
          </RadioGroupItem>
        ))}
      </RadioGroup>
      {items.length > MAX_LISTED && (
        <p className={styles.hint}>
          Showing the first {MAX_LISTED} of {items.length}. Refine your search
          to see more.
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {(type === "volume" || type === "volume_snapshot") && (
        <SwitchInput
          control={form.control}
          name="delete_volume_on_termination"
          label="Delete the volume when the instance is deleted"
        />
      )}
    </div>
  );
}

function imageMeta(image: Image): string {
  const parts = [
    image.is_snapshot ? "snapshot" : image.visibility,
    formatBytes(image.size),
    image.min_disk ? `min disk ${image.min_disk} GB` : "",
    image.min_ram ? `min RAM ${formatMb(image.min_ram)}` : "",
  ];
  return parts.filter(Boolean).join(", ");
}

function FlavorStep({ form, data }: { form: FormApi; data: LaunchOptions }) {
  const chosen = useWatch({ control: form.control, name: "flavor_id" });
  const sourceType = useWatch({ control: form.control, name: "source_type" });
  const sourceId = useWatch({ control: form.control, name: "source_id" });
  const image =
    sourceType === "image" || sourceType === "snapshot"
      ? [...(data.images ?? []), ...(data.snapshots ?? [])].find(
          (i) => i.id === sourceId,
        )
      : undefined;
  const flavors = useMemo(
    () =>
      [...(data.flavors ?? [])].sort(
        // Cheapest first; flavours without a rate (special families) last.
        (a, b) =>
          (a.su_rate ?? Number.MAX_VALUE) - (b.su_rate ?? Number.MAX_VALUE) ||
          a.name.localeCompare(b.name),
      ),
    [data.flavors],
  );
  const tooSmall = (flavor: Flavor): string | null => {
    if (!image) return null;
    if (
      image.min_disk &&
      flavor.disk_gb !== null &&
      flavor.disk_gb > 0 &&
      flavor.disk_gb < image.min_disk
    ) {
      return `Disk is smaller than the image's minimum (${image.min_disk} GB)`;
    }
    if (
      image.min_ram &&
      flavor.ram_mb !== null &&
      flavor.ram_mb < image.min_ram
    ) {
      return `RAM is below the image's minimum (${formatMb(image.min_ram)})`;
    }
    return null;
  };
  const disabled = flavors.filter((f) => tooSmall(f)).map((f) => f.id);
  const selected = flavors.find((f) => f.id === chosen);
  const error = form.formState.errors.flavor_id?.message;
  const onSelectionChange = (keys: Selection) => {
    const key = keys === "all" ? null : [...keys][0];
    form.setValue("flavor_id", key ? String(key) : "", {
      shouldValidate: true,
      shouldDirty: true,
    });
  };
  return (
    <div className={styles.fields}>
      <p className={styles.hint}>
        Service units (SU) are charged per hour the instance exists, whether it
        is running or not.
      </p>
      <Table
        aria-label="Flavours"
        selectionMode="single"
        selectedKeys={chosen ? new Set([chosen]) : new Set()}
        onSelectionChange={onSelectionChange}
        disabledKeys={disabled}
        className={styles.flavorTable}
      >
        <TableHeader>
          <Column id="name" isRowHeader>
            Name
          </Column>
          <Column id="vcpus">vCPUs</Column>
          <Column id="ram">RAM</Column>
          <Column id="disk">Root disk</Column>
          <Column id="rate">SU/hour</Column>
          <Column id="notes">Notes</Column>
        </TableHeader>
        <TableBody items={flavors}>
          {(flavor) => (
            <Row id={flavor.id}>
              <Cell>{flavor.name}</Cell>
              <Cell>{flavor.vcpus ?? ""}</Cell>
              <Cell>{formatMb(flavor.ram_mb)}</Cell>
              <Cell>
                {flavor.disk_gb ? formatGb(flavor.disk_gb) : "volume"}
              </Cell>
              <Cell>
                {flavor.su_rate === null ? "" : formatNumber(flavor.su_rate)}
              </Cell>
              <Cell>
                {tooSmall(flavor) ??
                  (flavor.is_preemptible ? (
                    <StatusPill tone="warning">Preemptible</StatusPill>
                  ) : (
                    ""
                  ))}
              </Cell>
            </Row>
          )}
        </TableBody>
      </Table>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {selected?.is_preemptible && (
        <Alert tone="warning" role="status">
          {data.defaults.preemptible_notice}
        </Alert>
      )}
    </div>
  );
}

function NetworksStep({
  form,
  data,
  projectId,
}: {
  form: FormApi;
  data: LaunchOptions;
  projectId: string;
}) {
  // Ports are only offered when the project has some to attach.
  const ports = useQuery(attachablePortsQuery(projectId));
  const networks = (data.networks ?? []).map((network) => ({
    id: network.id,
    label: `${network.name}${network.is_classic ? " (classic, public IP)" : ""}${
      network.subnets.length
        ? `: ${network.subnets
            .map((s) => s.cidr)
            .filter(Boolean)
            .join(", ")}`
        : ""
    }`,
  }));
  const portOptions = (ports.data?.items ?? []).map((port) => ({
    id: port.id,
    label: `${port.name || port.id} (${port.network_name ?? "network"}: ${port.fixed_ips.join(", ") || "no address"})`,
  }));
  return (
    <div className={styles.fields}>
      <CheckboxesInput
        control={form.control}
        name="networks"
        label="Networks"
        description="The instance gets an interface on each network you choose. The classic network gives it a public IP address."
        options={networks}
      />
      {portOptions.length > 0 && (
        <CheckboxesInput
          control={form.control}
          name="ports"
          label="Existing ports"
          description="Attach ports you have already created."
          options={portOptions}
        />
      )}
    </div>
  );
}

function SecurityStep({ form, data }: { form: FormApi; data: LaunchOptions }) {
  const groups = (data.security_groups ?? []).map((group) => ({
    id: group.name,
    label: group.description
      ? `${group.name}: ${group.description}`
      : group.name,
  }));
  return (
    <div className={styles.fields}>
      <CheckboxesInput
        control={form.control}
        name="security_groups"
        label="Security groups"
        description="Firewall rules applied to the instance's interfaces. The default group allows outbound traffic only."
        options={groups}
      />
    </div>
  );
}

type KeyPairDialogMode = "create" | "import" | null;

function KeyPairStep({
  form,
  data,
  onOpenDialog,
}: {
  form: FormApi;
  data: LaunchOptions;
  onOpenDialog: (mode: KeyPairDialogMode) => void;
}) {
  const options = [
    { id: NONE, label: "No key pair" },
    ...(data.key_pairs ?? []).map((keyPair) => ({
      id: keyPair.name,
      label: `${keyPair.name}${keyPair.fingerprint ? ` (${keyPair.fingerprint})` : ""}`,
    })),
  ];
  return (
    <div className={styles.fields}>
      <SelectInput
        control={form.control}
        name="key_name"
        label="Key pair"
        description="The public key is installed on the instance so you can log in with SSH."
        options={options}
        placeholder="Choose a key pair"
      />
      <div className={styles.inlineButtons}>
        <Button
          variant="secondary"
          size="xs"
          onPress={() => onOpenDialog("create")}
        >
          Create key pair
        </Button>
        <Button
          variant="secondary"
          size="xs"
          onPress={() => onOpenDialog("import")}
        >
          Import public key
        </Button>
      </div>
    </div>
  );
}

function KeyPairDialogs({
  projectId,
  form,
  mode,
  onOpenChange,
}: {
  projectId: string;
  form: FormApi;
  mode: KeyPairDialogMode;
  onOpenChange: (mode: KeyPairDialogMode) => void;
}) {
  const onCreated = (keyPair: { name: string }) => {
    form.setValue("key_name", keyPair.name, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };
  return (
    <>
      <CreateKeyPairDialog
        projectId={projectId}
        isOpen={mode === "create"}
        onOpenChange={(open) => !open && onOpenChange(null)}
        onCreated={onCreated}
      />
      <ImportKeyPairDialog
        projectId={projectId}
        isOpen={mode === "import"}
        onOpenChange={(open) => !open && onOpenChange(null)}
        onCreated={onCreated}
      />
    </>
  );
}

function ConfigStep({ form, data }: { form: FormApi; data: LaunchOptions }) {
  const metadata = useFieldArray({ control: form.control, name: "metadata" });
  const groups = [
    { id: NONE, label: "No server group" },
    ...(data.server_groups ?? []).map((group) => ({
      id: group.id,
      label: `${group.name} (${group.policy})`,
    })),
  ];
  return (
    <div className={styles.fields}>
      <TextAreaInput
        control={form.control}
        name="user_data"
        label="Customisation script (user data)"
        description="A cloud-init script or configuration run on first boot."
        rows={8}
        monospace
      />
      <SelectInput
        control={form.control}
        name="server_group_id"
        label="Server group"
        description="Keeps instances together (affinity) or apart (anti-affinity)."
        options={groups}
        placeholder="No server group"
      />
      <div className={styles.metadata}>
        <Label>Metadata</Label>
        <Text slot="description" className={styles.hint}>
          Key and value pairs stored with the instance.
        </Text>
        {metadata.fields.map((field, index) => (
          <div key={field.id} className={styles.metadataRow}>
            <TextInput
              control={form.control}
              name={`metadata.${index}.key`}
              label="Key"
              isRequired
            />
            <TextInput
              control={form.control}
              name={`metadata.${index}.value`}
              label="Value"
            />
            <Button
              variant="link"
              size="xs"
              onPress={() => metadata.remove(index)}
            >
              Remove
            </Button>
          </div>
        ))}
        <div>
          <Button
            variant="secondary"
            size="xs"
            iconBefore="plus"
            onPress={() => metadata.append({ key: "", value: "" })}
          >
            Add metadata
          </Button>
        </div>
      </div>
    </div>
  );
}

function Summary({
  form,
  data,
}: {
  form: FormApi;
  data: LaunchOptions | undefined;
}) {
  const values = form.watch();
  const flavor = data?.flavors?.find((f) => f.id === values.flavor_id);
  const sourceName = (() => {
    switch (values.source_type) {
      case "image":
        return data?.images?.find((i) => i.id === values.source_id)?.name;
      case "snapshot":
        return data?.snapshots?.find((i) => i.id === values.source_id)?.name;
      case "volume":
        return data?.volumes?.find((v) => v.id === values.source_id)?.name;
      default:
        return data?.volume_snapshots?.find((v) => v.id === values.source_id)
          ?.name;
    }
  })();
  const networkNames = (data?.networks ?? [])
    .filter((n) => values.networks.includes(n.id))
    .map((n) => n.name);
  const rate = flavor?.su_rate ?? null;
  return (
    <aside className={styles.summary} aria-label="Summary">
      <Panel title="Summary" headingLevel={3}>
        <KeyValueList
          items={[
            { label: "Name", value: values.name },
            { label: "Count", value: values.count },
            { label: "Availability zone", value: values.availability_zone },
            { label: "Source", value: sourceName ?? "" },
            { label: "Flavour", value: flavor?.name },
            {
              label: "Cost",
              value:
                rate === null
                  ? ""
                  : `${formatSuRate(rate * (values.count || 1))}${values.count > 1 ? ` (${formatSuRate(rate)} each)` : ""}`,
            },
            { label: "Networks", value: networkNames.join(", ") },
            {
              label: "Security groups",
              value: values.security_groups.join(", "),
            },
            {
              label: "Key pair",
              value:
                values.key_name && values.key_name !== NONE
                  ? values.key_name
                  : "",
            },
          ]}
        />
      </Panel>
    </aside>
  );
}
