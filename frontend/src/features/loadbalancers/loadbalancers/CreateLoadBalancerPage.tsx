// The create load balancer wizard (octavia-dashboard workflow): details,
// then an optional listener, pool, members and health monitor that the
// backend creates one after another once the load balancer is active.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import type { FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert } from "@ardc-ui/react";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import type { WizardSteps } from "../../../components/Wizard/steps";
import { useWizard } from "../../../components/Wizard/useWizard";
import { WizardForm } from "../../../components/Wizard/WizardForm";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { notify } from "../../../lib/notify";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { loadBalancerOptionsQuery, useCreateLoadBalancer } from "../api";
import {
  CREATE_DEFAULTS,
  createFormSchema,
  type CreateForm,
  type CreateStepProps,
} from "./createForm";
import { createRequest } from "./request";
import { DetailsStep } from "./steps/DetailsStep";
import { ListenerStep } from "./steps/ListenerStep";
import { MembersStep } from "./steps/MembersStep";
import { MonitorStep } from "./steps/MonitorStep";
import { PoolStep } from "./steps/PoolStep";

// A part's step validates the whole part (`listener`, `pool`, `monitor`).
const STEPS = {
  details: {
    title: "Load balancer",
    fields: [
      "name",
      "vip_subnet_id",
      "vip_address",
      "flavor_id",
      "availability_zone",
    ],
    Component: DetailsStep,
  },
  listener: {
    title: "Listener",
    fields: ["create_listener", "listener"],
    Component: ListenerStep,
  },
  pool: {
    title: "Pool",
    fields: ["create_pool", "pool"],
    Component: PoolStep,
  },
  members: { title: "Members", fields: ["members"], Component: MembersStep },
  monitor: {
    title: "Health monitor",
    fields: ["create_monitor", "monitor"],
    Component: MonitorStep,
  },
} satisfies WizardSteps<string, FieldPath<CreateForm>, CreateStepProps>;

/**
 * The create load balancer page: the wizard once the options load, with a
 * warning when the project has no subnet to put the load balancer on.
 */
export function CreateLoadBalancerPage() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const create = useCreateLoadBalancer();
  const resolver = useMemo(
    () => zodResolver(createFormSchema(options.data?.subnets ?? [])),
    [options.data],
  );
  const form = useForm<CreateForm>({
    resolver,
    mode: "onTouched",
    defaultValues: CREATE_DEFAULTS,
  });
  const wizard = useWizard({
    form,
    steps: STEPS,
    leaveTitle: "Leave without creating the load balancer?",
  });

  const submit = wizard.handleSubmit((values) => {
    create.mutate(createRequest(values), {
      onSuccess: () => {
        notify.success("A new load balancer is being created.");
        wizard.leave(() => void navigate({ to: "/load-balancers" }));
      },
    });
  });

  const data = options.data;
  return (
    <>
      <PageHeader
        title="Create load balancer"
        crumbs={[
          { label: "Project" },
          { label: "Network" },
          { label: "Load balancers", href: "/load-balancers" },
        ]}
      />
      {options.isError ? (
        <ErrorState error={options.error} onRetry={() => options.refetch()} />
      ) : (
        <WizardForm
          wizard={wizard}
          stepProps={data && { data }}
          label="Create load balancer steps"
          onSubmit={submit}
          submission={create}
          submitLabel="Create load balancer"
          pendingLabel="Creating..."
          errorTitle="Could not create the load balancer"
          cancelTo="/load-balancers"
          notices={
            data &&
            data.subnets.length === 0 && (
              <Alert tone="warning" role="status">
                Your project has no subnet to put the load balancer on. Create a
                network with a subnet first.
              </Alert>
            )
          }
        />
      )}
    </>
  );
}
