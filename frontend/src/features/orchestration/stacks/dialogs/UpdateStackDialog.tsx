// Change stack template: the stack's current template and environment are
// the starting point; the changed one is validated, then the parameters
// form is prefilled from the stack's current values.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Dialog, Modal } from "@ardc-ui/react";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import type {
  ParameterSpec,
  StackDetail,
  TemplateSource,
} from "../../../../lib/api/types/orchestration";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { notify } from "../../../../lib/notify";
import {
  stackTemplateQuery,
  useUpdateStack,
  useValidateTemplate,
} from "../../api";
import { templateFormValues } from "../../status";
import { stackUpdateRequest } from "../request";
import { TemplateStep } from "../steps/TemplateStep";
import { UpdateDetailsStep } from "../steps/UpdateDetailsStep";

/**
 * Updates a stack with a new template in two steps, as launch does: the
 * template is validated first, then the parameters and settings are sent.
 * The template step opens on the stack's current template and environment
 * (the environment without its parameters, which the second step carries),
 * so a small change is a small edit; if they cannot be read it opens
 * empty and says so. The dialog cannot be dismissed while the update is in
 * flight.
 */
export function UpdateStackDialog({
  stack,
  onClose,
}: {
  stack: StackDetail;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const current = useQuery(stackTemplateQuery(projectId, stack.id));
  const validate = useValidateTemplate();
  const update = useUpdateStack();
  const [source, setSource] = useState<TemplateSource | null>(null);
  const [specs, setSpecs] = useState<ParameterSpec[] | null>(null);
  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && !update.isPending && onClose()}
      size="lg"
      isDismissable
    >
      <Dialog title={`Change template of ${stack.name}`} closeLabel="Close">
        {current.isPending ? (
          <SkeletonLines lines={6} />
        ) : specs === null || source === null ? (
          <>
            {current.isError && (
              <Alert tone="warning" role="status">
                The stack's current template could not be loaded. Paste the new
                template or choose its file.
              </Alert>
            )}
            <TemplateStep
              isPending={validate.isPending}
              error={validate.error}
              submitLabel="Next"
              initial={
                source
                  ? templateFormValues(source)
                  : {
                      template: current.data?.template_yaml ?? "",
                      environment:
                        current.data?.editable_environment_yaml ?? "",
                    }
              }
              onValidate={(body) =>
                validate.mutate(body, {
                  onSuccess: (result) => {
                    setSource(body);
                    setSpecs(result.parameters);
                  },
                })
              }
            />
          </>
        ) : (
          <UpdateDetailsStep
            stack={stack}
            specs={specs}
            isPending={update.isPending}
            error={update.error}
            onBack={() => setSpecs(null)}
            onSubmit={(values, parameters) =>
              update.mutate(
                {
                  id: stack.id,
                  ...stackUpdateRequest(source, values, parameters),
                },
                {
                  onSuccess: () => {
                    notify.success(`Stack ${stack.name} is being updated.`);
                    onClose();
                  },
                },
              )
            }
          />
        )}
      </Dialog>
    </Modal>
  );
}
