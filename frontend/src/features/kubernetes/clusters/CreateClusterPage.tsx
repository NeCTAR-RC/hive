// Create cluster, as the Nectar magnum-ui workflow: name, then the
// Kubernetes version, availability zone and network driver that pick the
// template, control plane and worker sizes, and an optional etcd volume;
// plus the key pair and worker autoscaling the Nectar fork had removed.
import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { FormProvider, useForm, useFormState, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button } from "@ardc-ui/react";
import { loadingProps } from "../../../components/buttonState";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { fieldsFor } from "../../../components/Form/fields";
import { useLeaveGuard } from "../../../components/LeaveGuard/useLeaveGuard";
import { Panel } from "../../../components/Panel/Panel";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { notify } from "../../../lib/notify";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { keyPairsQuery, limitsQuery } from "../../compute/api";
import { clusterOptionsQuery, useCreateCluster } from "../api";
import {
  driversFor,
  isSingleMaster,
  nextPick,
  soleChoice,
  templateDefaults,
  templateFor,
  zonesFor,
} from "./cascade";
import { ClusterSizePanel } from "./ClusterSizePanel";
import { ClusterTemplateSummary } from "./ClusterTemplateSummary";
import { EtcdVolumePanel } from "./EtcdVolumePanel";
import { quotaLeftText } from "./quota";
import {
  clusterCreateRequest,
  clusterSchema,
  type ClusterFormValues,
} from "./request";
import styles from "../Kubernetes.module.scss";

const createRoute = getRouteApi("/app/kubernetes/clusters/new");

/**
 * The create cluster form. The pickers cascade and the chosen template
 * fills the sizes it has defaults for (see `cascade.ts`); the template
 * itself shows beside the form. A template's "Create cluster" link
 * pre-fills its version, zone and driver where the options offer them.
 * The nodes are held to the compute quota before the request is sent.
 */
export function CreateClusterPage() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const search = createRoute.useSearch();
  const options = useQuery(clusterOptionsQuery(projectId));
  const limits = useQuery(limitsQuery(projectId));
  const keyPairs = useQuery(keyPairsQuery(projectId));
  const create = useCreateCluster();
  const { SelectInput, TextInput } = fieldsFor<ClusterFormValues>();
  const resolver = useMemo(
    () =>
      zodResolver(
        clusterSchema({
          flavors: options.data?.flavors ?? [],
          limits: limits.data,
        }),
      ),
    [options.data, limits.data],
  );
  const form = useForm<ClusterFormValues>({
    resolver,
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
      keypair: "",
      autoscaling: false,
      etcd_volume: false,
      etcd_volume_type: "",
    },
  });
  const { isDirty } = useFormState({ control: form.control });
  const guard = useLeaveGuard({
    isDirty,
    title: "Leave without creating the cluster?",
  });
  const [version, zone, driver] = useWatch({
    control: form.control,
    name: ["kubernetes_version", "availability_zone", "network_driver"],
  });
  const data = options.data;

  const zones = useMemo(
    () => zonesFor(data?.combinations ?? [], version),
    [data, version],
  );
  const drivers = useMemo(
    () => driversFor(data?.combinations ?? [], version, zone),
    [data, version, zone],
  );
  const template = templateFor(data, version, zone, driver);
  const singleMaster = isSingleMaster(template);

  // A template's link pre-fills its version, zone and driver once, where
  // the options offer them; the cascade below then keeps them.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!data || prefilled.current) return;
    prefilled.current = true;
    if (!search.version || !data.versions.includes(search.version)) return;
    form.setValue("kubernetes_version", search.version);
    const offered = zonesFor(data.combinations, search.version);
    if (!search.zone || !offered.includes(search.zone)) return;
    form.setValue("availability_zone", search.zone);
    const drivers = driversFor(data.combinations, search.version, search.zone);
    if (search.driver && drivers.includes(search.driver)) {
      form.setValue("network_driver", search.driver);
    }
  }, [data, search, form]);

  // Auto-select single options and reset the pickers below a change.
  useEffect(() => {
    if (!data || version) return;
    const sole = soleChoice(data.versions);
    if (sole !== undefined) form.setValue("kubernetes_version", sole);
  }, [data, version, form]);
  useEffect(() => {
    const pick = nextPick(zone, zones);
    if (pick !== undefined) form.setValue("availability_zone", pick);
  }, [zones, zone, form]);
  useEffect(() => {
    const pick = nextPick(driver, drivers);
    if (pick !== undefined) form.setValue("network_driver", pick);
  }, [drivers, driver, form]);
  useEffect(() => {
    if (!template) return;
    const defaults = templateDefaults(
      template,
      data?.flavors ?? [],
      form.getValues(),
    );
    if (defaults.master_flavor_id)
      form.setValue("master_flavor_id", defaults.master_flavor_id);
    if (defaults.flavor_id) form.setValue("flavor_id", defaults.flavor_id);
    if (defaults.master_count)
      form.setValue("master_count", defaults.master_count);
  }, [template, data, form]);

  const submit = form.handleSubmit((values) => {
    if (!template) {
      form.setError("network_driver", {
        message: "No template matches this combination",
      });
      return;
    }
    create.mutate(clusterCreateRequest(values, template.id), {
      onSuccess: (created) => {
        notify.success(`Cluster ${created.name} is being created.`);
        guard.leave(() => void navigate({ to: "/kubernetes/clusters" }));
      },
    });
  });

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
          { label: "Container infra" },
          { label: "Clusters", href: "/kubernetes/clusters" },
        ]}
      />
      {/* The form waits for the limits too, so the worker count's quota help
          is there when the field mounts (React Aria links a description
          present at mount); a failed limits read only drops that help. */}
      {options.isPending || limits.isPending ? (
        <SkeletonLines lines={8} />
      ) : options.isError ? (
        <ErrorState error={options.error} onRetry={() => options.refetch()} />
      ) : (
        <FormProvider {...form}>
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
                  <TextInput name="name" label="Cluster name" isRequired />
                  <SelectInput
                    name="kubernetes_version"
                    label="Kubernetes version"
                    options={(data?.versions ?? []).map((v) => ({
                      id: v,
                      label: v,
                    }))}
                    isRequired
                  />
                  <SelectInput
                    name="availability_zone"
                    label="Availability zone"
                    options={zones.map((z) => ({ id: z, label: z }))}
                    isRequired
                    isDisabled={!version}
                  />
                  <SelectInput
                    name="network_driver"
                    label="Network driver"
                    options={drivers.map((d) => ({ id: d, label: d }))}
                    isRequired
                    isDisabled={!zone}
                  />
                  <SelectInput
                    name="keypair"
                    label="Key pair"
                    description="Lets you log in to the nodes over SSH to debug them. Optional."
                    options={[
                      { id: "", label: "None" },
                      ...(keyPairs.data?.items ?? []).map((k) => ({
                        id: k.name,
                        label: k.name,
                      })),
                    ]}
                  />
                </div>
              </Panel>
              <ClusterSizePanel
                flavors={data?.flavors ?? []}
                controlPlaneSizes={data?.control_plane_sizes ?? [1, 3, 5, 7]}
                singleMaster={singleMaster}
                quotaLeft={quotaLeftText(limits.data)}
              />
              <EtcdVolumePanel />
              {create.isError && (
                <ErrorState
                  error={create.error}
                  title="Could not create the cluster"
                />
              )}
              <div className={styles.buttons}>
                <Button
                  type="submit"
                  {...loadingProps(create.isPending, "Creating...")}
                >
                  Create cluster
                </Button>
              </div>
            </div>
            <ClusterTemplateSummary template={template} />
          </form>
        </FormProvider>
      )}
      {guard.dialog}
    </>
  );
}
