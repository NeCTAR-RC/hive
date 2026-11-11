// The launch wizard. One react-hook-form across seven steps, each validated
// on Next; the Nectar rules (a zone before a new boot volume, classic
// network first and preselected, otherwise only a sole network, community
// images hidden until searched, flavour classes, reservation flavours, SU
// per hour and the preemptible notice on flavours) come from the backend's
// launch options.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { OptionErrors } from "../../../components/OptionErrors/OptionErrors";
import { useWizard } from "../../../components/Wizard/useWizard";
import { WizardForm } from "../../../components/Wizard/WizardForm";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { notify } from "../../../lib/notify";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { launchOptionsQuery, useLaunch } from "../api";
import { defaultNetworkIds, parseSource } from "./launch";
import { findLinkedFlavor, flavorGroupId } from "./launchFlavors";
import {
  ANY_ZONE,
  DEFAULT_VOLUME_TYPE,
  launchRequest,
  launchSchema,
  type LaunchForm,
} from "./launchForm";
import { LaunchKeyPairDialogs } from "./LaunchKeyPairDialogs";
import { LaunchQuotaWarning } from "./LaunchQuotaWarning";
import { LaunchSummary } from "./LaunchSummary";
import { launchSteps } from "./steps/launchSteps";
import type { KeyPairDialogMode } from "./steps/props";

const launchRoute = getRouteApi("/app/compute/instances/launch");

/** Option sections whose names are not their key sentence cased. */
const SECTION_LABELS: Record<string, string> = {
  flavors: "Flavours",
  limits: "Quota",
};

/**
 * The launch instance page: the wizard over the launch options, with the
 * options' partial failures and the quota warning above the steps and the
 * summary beside them. A `source` or `flavor` deep link preselects that
 * choice once the options load; a flavour the project cannot see stays
 * unchosen, and the flavour step says why rather than offering another.
 */
export function LaunchPage() {
  const projectId = useProjectId();
  const search = launchRoute.useSearch();
  const navigate = useNavigate();
  const options = useQuery(launchOptionsQuery(projectId));
  const launch = useLaunch();
  const [keyPairDialog, setKeyPairDialog] = useState<KeyPairDialogMode>(null);

  const resolver = useMemo(
    () => zodResolver(launchSchema(options.data)),
    [options.data],
  );
  const form = useForm<LaunchForm>({
    resolver,
    mode: "onTouched",
    defaultValues: {
      name: "",
      description: "",
      availability_zone: ANY_ZONE,
      count: 1,
      source_type: "image",
      source_id: "",
      create_volume: false,
      volume_type: DEFAULT_VOLUME_TYPE,
      delete_volume_on_termination: false,
      flavor_class: "",
      flavor_id: "",
      networks: [],
      ports: [],
      security_groups: [],
      key_name: "",
      user_data: "",
      server_group_id: "",
      config_drive: false,
      metadata: [],
    },
  });
  const wizard = useWizard({
    form,
    steps: launchSteps,
    leaveTitle: "Leave without launching?",
  });

  // Once the options arrive, apply Nectar's defaults and any deep link.
  const applied = useRef(false);
  useEffect(() => {
    const data = options.data;
    if (!data || applied.current) return;
    applied.current = true;
    const source = parseSource(search.source);
    const keyPairs = data.key_pairs ?? [];
    const linked = findLinkedFlavor(data.flavors, search.flavor);
    // The zone stays "Any availability zone", Horizon's default
    // (launch-instance-model.service.js onGetAvailabilityZones).
    form.reset({
      ...form.getValues(),
      source_type: source?.type ?? "image",
      source_id: source?.id ?? "",
      flavor_id: linked?.id ?? "",
      flavor_class: linked ? flavorGroupId(linked) : "",
      networks: defaultNetworkIds(data.networks),
      security_groups: data.security_groups?.some((g) => g.name === "default")
        ? ["default"]
        : [],
      key_name: keyPairs.length === 1 ? (keyPairs[0]?.name ?? "") : "",
    });
  }, [options.data, search.source, search.flavor, form]);

  const submit = wizard.handleSubmit((values) => {
    launch.mutate(launchRequest(values, options.data), {
      onSuccess: (result) => {
        const n = result.ids.length || values.count;
        notify.success(
          n === 1
            ? `Instance ${values.name} is launching.`
            : `${n} instances are launching.`,
        );
        wizard.leave(
          () => void navigate({ to: "/compute/instances", search: {} }),
        );
      },
    });
  });

  const data = options.data;
  const missingFlavor =
    search.flavor && data && !findLinkedFlavor(data.flavors, search.flavor)
      ? search.flavor
      : null;

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
        <WizardForm
          wizard={wizard}
          stepProps={
            data && {
              data,
              onOpenKeyPairDialog: setKeyPairDialog,
              missingFlavor,
            }
          }
          label="Launch steps"
          onSubmit={submit}
          submission={launch}
          submitLabel="Launch"
          pendingLabel="Launching..."
          errorTitle="Launch failed"
          cancelTo="/compute/instances"
          notices={
            <>
              <OptionErrors errors={data?.errors} labels={SECTION_LABELS}>
                <p>You can still launch with what is available.</p>
              </OptionErrors>
              <LaunchQuotaWarning data={data} />
            </>
          }
          aside={<LaunchSummary form={form} data={data} />}
        />
      )}
      <LaunchKeyPairDialogs
        form={form}
        mode={keyPairDialog}
        onOpenChange={setKeyPairDialog}
      />
    </>
  );
}
