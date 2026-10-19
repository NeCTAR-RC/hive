// Launch a database instance, as the Nectar trove-dashboard workflow:
// details (AZ, name, volume, datastore and version, flavour), one network,
// required allowed CIDRs, optional initial databases and user, and the
// advanced configuration group and restore-from-backup options.
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Button } from "@ardc-ui/react";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import {
  NumberInput,
  SelectInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { loadingProps } from "../../components/buttonState";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { launchDbRoute } from "../../app/router";
import { dbOptionsQuery, useLaunchInstance } from "./api";
import {
  CIDR_WARNING,
  flavorLabel,
  hasOpenCidr,
  quotaLimit,
  splitCidrs,
} from "./status";
import styles from "./Databases.module.scss";

const schema = z
  .object({
    name: z.string().trim().min(1, "Enter an instance name").max(80),
    datastore: z
      .string()
      .min(1, "You must select a datastore type and version"),
    flavor: z.string().min(1, "You must select a flavor"),
    volume: z.number().int().min(1, "At least 1 GB"),
    availability_zone: z.string(),
    network_id: z.string().min(1, "At least one network must be specified"),
    allowed_cidrs: z.string().refine((v) => splitCidrs(v).length > 0, {
      message: "Enter at least one CIDR",
    }),
    databases: z.string().trim(),
    user: z.string().trim().max(128),
    password: z.string().max(255),
    host: z.string().trim().max(255),
    configuration: z.string(),
    backup_id: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.user && !values.password) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "A password is required for the user",
      });
    }
    if (values.user && !values.databases) {
      ctx.addIssue({
        code: "custom",
        path: ["databases"],
        message: "At least one database is required when creating a user",
      });
    }
  });
type Values = z.infer<typeof schema>;

export function LaunchDbInstancePage() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const search = launchDbRoute.useSearch();
  const options = useQuery(dbOptionsQuery(projectId));
  const launch = useLaunchInstance(projectId);
  const data = options.data;
  const restoring = data?.backups.find((b) => b.id === search.backup);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      datastore: "",
      flavor: "",
      volume: 1,
      availability_zone: "",
      network_id: "",
      allowed_cidrs: "",
      databases: "",
      user: "",
      password: "",
      host: "",
      configuration: "",
      backup_id: search.backup ?? "",
    },
  });
  const [datastore, cidrs, backupId] = useWatch({
    control: form.control,
    name: ["datastore", "allowed_cidrs", "backup_id"],
  });
  const datastores = useMemo(() => {
    const all = data?.datastores ?? [];
    if (!restoring) return all;
    return all.filter(
      (d) =>
        d.datastore === restoring.datastore &&
        d.version === restoring.datastore_version,
    );
  }, [data, restoring]);
  const flavors = useMemo(
    () => data?.flavors_by_version[datastore] ?? data?.flavors ?? [],
    [data, datastore],
  );
  const [dsName, dsVersion] = datastore.split("/", 2);
  const configurations = useMemo(
    () =>
      (data?.configurations ?? []).filter(
        (c) => c.datastore === dsName && c.datastore_version === dsVersion,
      ),
    [data, dsName, dsVersion],
  );

  // Defaults once the pickers arrive: the first AZ (45cd6af), the first
  // network (4998972), the backup's datastore when restoring.
  useEffect(() => {
    if (!data) return;
    if (!form.getValues("availability_zone") && data.availability_zones[0]) {
      form.setValue("availability_zone", data.availability_zones[0]);
    }
    if (!form.getValues("network_id") && data.networks[0]) {
      form.setValue("network_id", data.networks[0].id);
    }
    if (!form.getValues("allowed_cidrs")) {
      form.setValue("allowed_cidrs", data.default_cidr);
    }
  }, [data, form]);
  useEffect(() => {
    if (datastores.length === 1 && !form.getValues("datastore")) {
      const only = datastores[0];
      form.setValue("datastore", `${only?.datastore}/${only?.version}`);
    }
  }, [datastores, form]);
  useEffect(() => {
    const chosen = form.getValues("flavor");
    if (chosen && !flavors.some((f) => f.id === chosen))
      form.setValue("flavor", "");
  }, [flavors, form]);
  useEffect(() => {
    const chosen = form.getValues("configuration");
    if (chosen && !configurations.some((c) => c.id === chosen))
      form.setValue("configuration", "");
  }, [configurations, form]);

  const submit = form.handleSubmit((values) => {
    const [type, version] = values.datastore.split("/", 2);
    launch.mutate(
      {
        name: values.name,
        flavor: values.flavor,
        volume: values.volume,
        datastore: type ?? "",
        version: version ?? "",
        network_id: values.network_id,
        allowed_cidrs: splitCidrs(values.allowed_cidrs),
        ...(values.availability_zone
          ? { availability_zone: values.availability_zone }
          : {}),
        ...(values.databases ? { databases: values.databases } : {}),
        ...(values.user
          ? { user: values.user, password: values.password }
          : {}),
        ...(values.user && values.host ? { host: values.host } : {}),
        ...(values.configuration
          ? { configuration: values.configuration }
          : {}),
        ...(values.backup_id ? { backup_id: values.backup_id } : {}),
      },
      {
        onSuccess: (instance) => {
          notify.success(
            `Database instance ${instance.name} is being created.`,
          );
          void navigate({ to: "/databases/instances" });
        },
      },
    );
  });

  const quota = data?.quota;
  return (
    <>
      <PageHeader
        title="Launch database instance"
        crumbs={[
          { label: "Project" },
          { label: "Database" },
          { label: "Instances", href: "/databases/instances" },
        ]}
      />
      {options.isPending ? (
        <SkeletonLines lines={10} />
      ) : options.isError ? (
        <ErrorState error={options.error} onRetry={() => options.refetch()} />
      ) : (
        <form onSubmit={submit} noValidate className={styles.layout}>
          <div className={styles.form}>
            {restoring && (
              <Alert tone="info" role="status">
                Restoring from backup {restoring.name || restoring.id} (
                {restoring.datastore} {restoring.datastore_version}).
              </Alert>
            )}
            <Panel title="Details" headingLevel={2}>
              <div className={styles.fields}>
                <TextInput
                  control={form.control}
                  name="name"
                  label="Instance name"
                  isRequired
                />
                <SelectInput
                  control={form.control}
                  name="availability_zone"
                  label="Availability zone"
                  options={(data?.availability_zones ?? []).map((z) => ({
                    id: z,
                    label: z,
                  }))}
                />
                <SelectInput
                  control={form.control}
                  name="datastore"
                  label="Datastore"
                  options={datastores.map((d) => ({
                    id: `${d.datastore}/${d.version}`,
                    label: d.label,
                  }))}
                  isRequired
                />
                <SelectInput
                  control={form.control}
                  name="flavor"
                  label="Flavour"
                  options={flavors.map((f) => ({
                    id: f.id ?? "",
                    label: flavorLabel(f),
                  }))}
                  isRequired
                  isDisabled={!datastore}
                />
                <NumberInput
                  control={form.control}
                  name="volume"
                  label="Volume size"
                  addon="GB"
                  minValue={1}
                  isRequired
                />
              </div>
            </Panel>
            <Panel title="Networking and access" headingLevel={2}>
              <div className={styles.fields}>
                <SelectInput
                  control={form.control}
                  name="network_id"
                  label="Network"
                  options={(data?.networks ?? []).map((n) => ({
                    id: n.id,
                    label: n.name || n.id,
                  }))}
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
                {hasOpenCidr(splitCidrs(cidrs ?? "")) && (
                  <Alert tone="warning" role="status">
                    {CIDR_WARNING}
                  </Alert>
                )}
              </div>
            </Panel>
            <Panel title="Initialise databases" headingLevel={2}>
              <div className={styles.fields}>
                <TextInput
                  control={form.control}
                  name="databases"
                  label="Initial databases"
                  description="Comma separated names to create on launch."
                />
                <TextInput
                  control={form.control}
                  name="user"
                  label="Initial admin user"
                  autoComplete="off"
                />
                <TextInput
                  control={form.control}
                  name="password"
                  label="Password"
                  type="password"
                  autoComplete="new-password"
                />
                <TextInput
                  control={form.control}
                  name="host"
                  label="Allowed host"
                  description="Leave blank to allow the user from any host."
                />
              </div>
            </Panel>
            <Panel title="Advanced" headingLevel={2}>
              <div className={styles.fields}>
                <SelectInput
                  control={form.control}
                  name="configuration"
                  label="Configuration group"
                  options={[
                    { id: "", label: "None" },
                    ...configurations.map((c) => ({
                      id: c.id,
                      label: c.name || c.id,
                    })),
                  ]}
                  isDisabled={!datastore}
                />
                <SelectInput
                  control={form.control}
                  name="backup_id"
                  label="Restore from backup"
                  options={[
                    { id: "", label: "None" },
                    ...(data?.backups ?? []).map((b) => ({
                      id: b.id,
                      label: `${b.name || b.id} (${b.datastore} ${b.datastore_version})`,
                    })),
                  ]}
                />
                {backupId && (
                  <p className={styles.muted}>
                    The datastore and version must match the backup.
                  </p>
                )}
              </div>
            </Panel>
            {launch.isError && (
              <ErrorState
                error={launch.error}
                title="Could not launch the instance"
              />
            )}
            <div className={styles.buttons}>
              <Button
                type="submit"
                {...loadingProps(launch.isPending, "Launching...")}
                isPending={launch.isPending}
              >
                Launch
              </Button>
            </div>
          </div>
          <Panel title="Quota" headingLevel={2} className={styles.summary}>
            <KeyValueList
              items={[
                { label: "Instances", value: quotaLimit(quota?.max_instances) },
                { label: "Volumes", value: quotaLimit(quota?.max_volumes) },
                { label: "Backups", value: quotaLimit(quota?.max_backups) },
                {
                  label: "RAM",
                  value: quotaLimit(quota?.max_ram, (mb) => `${mb} MB`),
                },
              ]}
            />
          </Panel>
        </form>
      )}
    </>
  );
}
