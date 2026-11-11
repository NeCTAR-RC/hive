// Launch a database instance, as the Nectar trove-dashboard workflow:
// details (AZ, name, volume, datastore and version, flavour), one network,
// required allowed CIDRs, optional initial databases and user, and the
// advanced configuration group and restore-from-backup options, beside
// the database quota it draws on.
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { FormProvider, useForm, useFormState, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button } from "@ardc-ui/react";
import { loadingProps } from "../../../components/buttonState";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { useLeaveGuard } from "../../../components/LeaveGuard/useLeaveGuard";
import { Panel } from "../../../components/Panel/Panel";
import { QuotaMeter } from "../../../components/QuotaMeter/QuotaMeter";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { formatGb, formatMb } from "../../../lib/format";
import { notify } from "../../../lib/notify";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { hasRoom } from "../../../lib/quota";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { dbInstancesQuery, dbOptionsQuery, useLaunchInstance } from "../api";
import {
  datastoreKey,
  launchRequest,
  launchRoom,
  launchSchema,
  offeredConfigurations,
  offeredDatastores,
  restoreVolumeSize,
  type LaunchValues,
} from "./launch";
import { LaunchInstanceFields } from "./LaunchInstanceFields";
import styles from "../Databases.module.scss";

const launchDbRoute = getRouteApi("/app/databases/instances/new");

/**
 * The launch form with the project's database quota beside it, used of
 * limit; a launch that would not fit is stopped in the form. A backup in
 * the URL (`backup`) is restored, which limits the datastores to its own
 * version, and a chosen backup raises the volume to the source instance's
 * size. The allowed CIDRs start empty, so opening the instance to every
 * address is a choice the user types.
 */
export function LaunchInstancePage() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const search = launchDbRoute.useSearch();
  const options = useQuery(dbOptionsQuery(projectId));
  const instances = useQuery(dbInstancesQuery(projectId));
  const launch = useLaunchInstance();
  const data = options.data;
  const restoring = data?.backups.find((b) => b.id === search.backup);
  const room = useMemo(
    () => launchRoom(data?.quota, instances.data?.items ?? []),
    [data, instances.data],
  );
  const schema = useMemo(
    () =>
      launchSchema({
        room,
        flavors: data?.flavors ?? [],
        backups: data?.backups ?? [],
      }),
    [room, data],
  );
  const form = useForm<LaunchValues>({
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
  const { isDirty } = useFormState({ control: form.control });
  const guard = useLeaveGuard({
    isDirty,
    title: "Leave without launching the database instance?",
  });
  const [datastore, backupId] = useWatch({
    control: form.control,
    name: ["datastore", "backup_id"],
  });
  const datastores = useMemo(
    () => offeredDatastores(data?.datastores ?? [], restoring),
    [data, restoring],
  );
  const flavors = useMemo(
    () => data?.flavors_by_version[datastore] ?? data?.flavors ?? [],
    [data, datastore],
  );
  const configurations = useMemo(
    () => offeredConfigurations(data?.configurations ?? [], datastore),
    [data, datastore],
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
  }, [data, form]);
  // A chosen backup raises the volume to what the restore needs; follow it
  // up, never down.
  useEffect(() => {
    const backup = data?.backups.find((b) => b.id === backupId);
    if (!backup) return;
    const size = restoreVolumeSize(backup, instances.data?.items ?? []);
    if (form.getValues("volume") < size) form.setValue("volume", size);
  }, [backupId, data, instances.data, form]);
  useEffect(() => {
    const only = datastores[0];
    if (datastores.length === 1 && only && !form.getValues("datastore")) {
      form.setValue("datastore", datastoreKey(only));
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
    launch.mutate(launchRequest(values), {
      onSuccess: (instance) => {
        notify.success(`Database instance ${instance.name} is being created.`);
        guard.leave(() => void navigate({ to: "/databases/instances" }));
      },
    });
  });

  const instancesFull = !hasRoom(room.instances);
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
        <FormProvider {...form}>
          <form onSubmit={submit} noValidate className={styles.layout}>
            <div className={styles.form}>
              <div className={styles.groups}>
                {instancesFull && (
                  <Alert tone="warning" role="status">
                    You are using all {room.instances.max} of your database
                    instances. Delete one before launching another.
                  </Alert>
                )}
                {restoring && (
                  <Alert tone="info" role="status">
                    Restoring from backup {restoring.name || restoring.id} (
                    {restoring.datastore} {restoring.datastore_version}).
                  </Alert>
                )}
                <LaunchInstanceFields
                  options={data}
                  datastores={datastores}
                  flavors={flavors}
                  configurations={configurations}
                />
                {launch.isError && (
                  <ErrorState
                    error={launch.error}
                    title="Could not launch the instance"
                  />
                )}
              </div>
              <div className={styles.buttons}>
                <Button
                  type="submit"
                  {...loadingProps(launch.isPending, "Launching...")}
                  isDisabled={!launch.isPending && instancesFull}
                >
                  Launch
                </Button>
              </div>
            </div>
            <Panel title="Quota" headingLevel={2} className={styles.summary}>
              <div className={styles.meters}>
                <QuotaMeter
                  label="Instances"
                  value={room.instances.used}
                  max={room.instances.max}
                />
                <QuotaMeter
                  label="Volume storage"
                  value={room.volumeGb.used}
                  max={room.volumeGb.max}
                  format={formatGb}
                />
                <QuotaMeter
                  label="RAM"
                  value={room.ramMb.used}
                  max={room.ramMb.max}
                  format={formatMb}
                />
              </div>
            </Panel>
          </form>
        </FormProvider>
      )}
      {guard.dialog}
    </>
  );
}
