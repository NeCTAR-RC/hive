// Create cluster, as the Nectar magnum-ui workflow: name, then the
// Kubernetes version, availability zone and network driver that pick the
// template, control plane and worker sizes, and an optional etcd volume.
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
  SwitchInput,
  TextInput,
} from "../../components/Form/fields";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import type { ClusterOptions } from "../../lib/api/types";
import { formatMb } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { clusterOptionsQuery, useCreateCluster } from "./api";
import styles from "./Kubernetes.module.scss";

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter a cluster name")
      .max(255)
      .regex(
        /^[a-zA-Z][a-zA-Z0-9_\-.]*$/,
        "Start with a letter; use letters, numbers, dots, dashes and underscores",
      ),
    kubernetes_version: z.string().min(1, "Choose a Kubernetes version"),
    availability_zone: z.string().min(1, "Choose an availability zone"),
    network_driver: z.string().min(1, "Choose a network driver"),
    master_count: z.string().min(1, "Choose the control plane size"),
    master_flavor_id: z.string().min(1, "Choose a control plane flavour"),
    node_count: z.number().int().min(0, "At least 0"),
    flavor_id: z.string().min(1, "Choose a worker flavour"),
    etcd_volume: z.boolean(),
    etcd_volume_size: z.number().int().min(1).optional(),
    etcd_volume_type: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.etcd_volume && !values.etcd_volume_size) {
      ctx.addIssue({
        code: "custom",
        path: ["etcd_volume_size"],
        message: "Enter the volume size in GB",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

function templateFor(
  options: ClusterOptions | undefined,
  version: string,
  zone: string,
  driver: string,
) {
  const combination = options?.combinations.find(
    (c) =>
      c.kubernetes_version === version &&
      c.availability_zone === zone &&
      c.network_driver === driver,
  );
  return combination
    ? options?.templates.find((t) => t.id === combination.template_id)
    : undefined;
}

export function CreateClusterPage() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const options = useQuery(clusterOptionsQuery(projectId));
  const create = useCreateCluster(projectId);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      kubernetes_version: "",
      availability_zone: "",
      network_driver: "",
      master_count: "1",
      master_flavor_id: "",
      node_count: 1,
      flavor_id: "",
      etcd_volume: false,
      etcd_volume_type: "",
    },
  });
  const [version, zone, driver, etcd] = useWatch({
    control: form.control,
    name: [
      "kubernetes_version",
      "availability_zone",
      "network_driver",
      "etcd_volume",
    ],
  });
  const data = options.data;

  // Cascading pickers: each one narrows the next (workflow.service.js).
  const zones = useMemo(
    () =>
      [
        ...new Set(
          (data?.combinations ?? [])
            .filter((c) => c.kubernetes_version === version)
            .map((c) => c.availability_zone),
        ),
      ].sort(),
    [data, version],
  );
  const drivers = useMemo(
    () =>
      [
        ...new Set(
          (data?.combinations ?? [])
            .filter(
              (c) =>
                c.kubernetes_version === version &&
                c.availability_zone === zone,
            )
            .map((c) => c.network_driver),
        ),
      ].sort(),
    [data, version, zone],
  );
  const template = templateFor(data, version, zone, driver);
  const singleMaster = template ? template.master_lb_enabled === false : false;

  // Auto-select single options and reset the pickers below a change.
  useEffect(() => {
    if (!data) return;
    if (!version && data.versions.length === 1) {
      form.setValue("kubernetes_version", data.versions[0] ?? "");
    }
  }, [data, version, form]);
  useEffect(() => {
    if (zone && !zones.includes(zone)) form.setValue("availability_zone", "");
    else if (!zone && zones.length === 1)
      form.setValue("availability_zone", zones[0] ?? "");
  }, [zones, zone, form]);
  useEffect(() => {
    if (driver && !drivers.includes(driver))
      form.setValue("network_driver", "");
    else if (!driver && drivers.length === 1)
      form.setValue("network_driver", drivers[0] ?? "");
  }, [drivers, driver, form]);
  // Template defaults (cluster-template.controller.js:72-110).
  useEffect(() => {
    if (!template) return;
    const flavors = data?.flavors.map((f) => f.name) ?? [];
    if (
      !form.getValues("master_flavor_id") &&
      template.master_flavor_id &&
      flavors.includes(template.master_flavor_id)
    ) {
      form.setValue("master_flavor_id", template.master_flavor_id);
    }
    if (
      !form.getValues("flavor_id") &&
      template.flavor_id &&
      flavors.includes(template.flavor_id)
    ) {
      form.setValue("flavor_id", template.flavor_id);
    }
    if (singleMaster) form.setValue("master_count", "1");
  }, [template, singleMaster, data, form]);

  const submit = form.handleSubmit((values) => {
    if (!template) {
      form.setError("network_driver", {
        message: "No template matches this combination",
      });
      return;
    }
    create.mutate(
      {
        name: values.name,
        cluster_template_id: template.id,
        master_count: Number(values.master_count),
        master_flavor_id: values.master_flavor_id,
        node_count: values.node_count,
        flavor_id: values.flavor_id,
        ...(values.etcd_volume && values.etcd_volume_size
          ? {
              etcd_volume_size: values.etcd_volume_size,
              ...(values.etcd_volume_type
                ? { etcd_volume_type: values.etcd_volume_type }
                : {}),
            }
          : {}),
      },
      {
        onSuccess: (created) => {
          notify.success(`Cluster ${created.name} is being created.`);
          void navigate({ to: "/kubernetes/clusters" });
        },
      },
    );
  });

  const flavorOptions = (data?.flavors ?? []).map((f) => ({
    id: f.name ?? "",
    label: `${f.name} (${f.vcpus ?? "?"} vCPU, ${formatMb(f.ram_mb) || "?"})`,
  }));
  const quotaFull =
    data?.quota &&
    data.quota.clusters !== null &&
    data.quota.clusters >= data.quota.hard_limit;

  return (
    <>
      <PageHeader
        title="Create cluster"
        crumbs={[
          { label: "Project" },
          { label: "Container Infra" },
          { label: "Clusters", href: "/kubernetes/clusters" },
        ]}
      />
      {options.isPending ? (
        <SkeletonLines lines={8} />
      ) : options.isError ? (
        <ErrorState error={options.error} onRetry={() => options.refetch()} />
      ) : (
        <form onSubmit={submit} noValidate className={styles.layout}>
          <div className={styles.form}>
            {quotaFull && (
              <Alert tone="warning" role="status">
                This project already uses all {data?.quota.hard_limit} of its
                clusters.
              </Alert>
            )}
            <Panel title="Details" headingLevel={2}>
              <div className={styles.fields}>
                <TextInput
                  control={form.control}
                  name="name"
                  label="Cluster name"
                  isRequired
                />
                <SelectInput
                  control={form.control}
                  name="kubernetes_version"
                  label="Kubernetes version"
                  options={(data?.versions ?? []).map((v) => ({
                    id: v,
                    label: v,
                  }))}
                  isRequired
                />
                <SelectInput
                  control={form.control}
                  name="availability_zone"
                  label="Availability zone"
                  options={zones.map((z) => ({ id: z, label: z }))}
                  isRequired
                  isDisabled={!version}
                />
                <SelectInput
                  control={form.control}
                  name="network_driver"
                  label="Network driver"
                  options={drivers.map((d) => ({ id: d, label: d }))}
                  isRequired
                  isDisabled={!zone}
                />
              </div>
            </Panel>
            <Panel title="Size" headingLevel={2}>
              <div className={styles.fields}>
                {singleMaster && (
                  <Alert tone="info" role="status">
                    This template runs a single control plane node.
                  </Alert>
                )}
                <SelectInput
                  control={form.control}
                  name="master_count"
                  label="Control plane nodes"
                  description="Supported control plane sizes are 1, 3, 5 or 7."
                  options={(data?.control_plane_sizes ?? [1, 3, 5, 7]).map(
                    (n) => ({
                      id: String(n),
                      label: String(n),
                      isDisabled: singleMaster && n !== 1,
                    }),
                  )}
                  isRequired
                />
                <SelectInput
                  control={form.control}
                  name="master_flavor_id"
                  label="Control plane flavour"
                  options={flavorOptions}
                  isRequired
                />
                <NumberInput
                  control={form.control}
                  name="node_count"
                  label="Worker nodes"
                  minValue={0}
                  isRequired
                />
                <SelectInput
                  control={form.control}
                  name="flavor_id"
                  label="Worker flavour"
                  options={flavorOptions}
                  isRequired
                />
              </div>
            </Panel>
            <Panel title="Advanced" headingLevel={2}>
              <div className={styles.fields}>
                <SwitchInput
                  control={form.control}
                  name="etcd_volume"
                  label="Store etcd on a separate volume"
                />
                {etcd && (
                  <>
                    <NumberInput
                      control={form.control}
                      name="etcd_volume_size"
                      label="etcd volume size"
                      addon="GB"
                      minValue={1}
                      isRequired
                    />
                    <TextInput
                      control={form.control}
                      name="etcd_volume_type"
                      label="etcd volume type"
                      description="Leave blank for the default type."
                    />
                  </>
                )}
              </div>
            </Panel>
            {create.isError && (
              <ErrorState
                error={create.error}
                title="Could not create the cluster"
              />
            )}
            <div className={styles.buttons}>
              {create.isPending ? (
                <Button state="loading" loadingText="Creating..." isDisabled>
                  Create cluster
                </Button>
              ) : (
                <Button type="submit">Create cluster</Button>
              )}
            </div>
          </div>
          <Panel title="Template" headingLevel={2} className={styles.summary}>
            {template ? (
              <KeyValueList
                items={[
                  { label: "Template", value: template.name },
                  {
                    label: "Kubernetes",
                    value: template.kubernetes_version ?? "-",
                  },
                  { label: "Zone", value: template.availability_zone ?? "-" },
                  {
                    label: "Network driver",
                    value: template.network_driver ?? "-",
                  },
                  {
                    label: "Image",
                    value: <code>{template.image_id ?? "-"}</code>,
                  },
                  {
                    label: "Control plane load balancer",
                    value: template.master_lb_enabled ? "Yes" : "No",
                  },
                ]}
              />
            ) : (
              <p className={styles.muted}>
                Choose a Kubernetes version, availability zone and network
                driver to see the template that will be used.
              </p>
            )}
          </Panel>
        </form>
      )}
    </>
  );
}
