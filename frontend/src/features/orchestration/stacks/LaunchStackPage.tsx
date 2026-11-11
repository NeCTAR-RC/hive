// Launch stack, as heat-dashboard's two steps: pick the template (file,
// pasted text or URL) and an optional environment, validate it, then fill
// the stack name, timeout, rollback and the generated parameters.
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { StepItem, Stepper } from "@ardc-ui/react";
import { useLeaveGuard } from "../../../components/LeaveGuard/useLeaveGuard";
import type {
  ParameterSpec,
  TemplateSource,
} from "../../../lib/api/types/orchestration";
import { notify } from "../../../lib/notify";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { useCreateStack, useValidateTemplate } from "../api";
import { templateFormValues } from "../status";
import { stackCreateRequest } from "./request";
import { DetailsStep } from "./steps/DetailsStep";
import { TemplateStep } from "./steps/TemplateStep";

/**
 * Launch stack as two steps under the library `Stepper`: the template,
 * validated by Heat before the second step opens, then the stack details
 * and generated parameters. The first step's marker returns to the
 * template from the second, as Back does; the Stepper shows only the
 * active step, so the template step starts again from the template that
 * validated.
 */
export function LaunchStackPage() {
  const navigate = useNavigate();
  const validate = useValidateTemplate();
  const create = useCreateStack();
  const [source, setSource] = useState<TemplateSource | null>(null);
  const [specs, setSpecs] = useState<ParameterSpec[] | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [templateDirty, setTemplateDirty] = useState(false);
  const onDetails = specs !== null && source !== null;
  const back = () => {
    setSpecs(null);
    create.reset();
  };
  // A validated template is input worth keeping, even back on the first step.
  const guard = useLeaveGuard({
    isDirty: templateDirty || source !== null,
    title: "Leave without launching the stack?",
  });

  return (
    <>
      <PageHeader
        title="Launch stack"
        crumbs={[
          { label: "Project" },
          { label: "Orchestration" },
          { label: "Stacks", href: "/orchestration/stacks" },
        ]}
      />
      <Stepper
        activeStep={onDetails ? "details" : "template"}
        onActiveStepChange={(key) => {
          if (key === "template") back();
        }}
        allowsJumping
        aria-label="Launch stack steps"
      >
        <StepItem id="template" title="Select template">
          <TemplateStep
            isPending={validate.isPending}
            error={validate.error}
            onDirtyChange={setTemplateDirty}
            cancelTo="/orchestration/stacks"
            {...(source ? { initial: templateFormValues(source) } : {})}
            onValidate={(body) =>
              validate.mutate(body, {
                onSuccess: (result) => {
                  setSource(body);
                  setSpecs(result.parameters);
                  setDescription(result.description);
                },
              })
            }
          />
        </StepItem>
        <StepItem id="details" title="Launch stack">
          {onDetails && (
            <DetailsStep
              specs={specs}
              description={description}
              isPending={create.isPending}
              error={create.error}
              cancelTo="/orchestration/stacks"
              onBack={back}
              onLaunch={(values, parameters) =>
                create.mutate(stackCreateRequest(source, values, parameters), {
                  onSuccess: (created) => {
                    notify.success(`Stack ${created.name} is being created.`);
                    guard.leave(
                      () => void navigate({ to: "/orchestration/stacks" }),
                    );
                  },
                })
              }
            />
          )}
        </StepItem>
      </Stepper>
      {guard.dialog}
    </>
  );
}
