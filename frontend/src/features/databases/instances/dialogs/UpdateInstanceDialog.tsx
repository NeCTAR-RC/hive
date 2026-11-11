// Update instance (trove-dashboard databases/forms.py with the Nectar patches): the
// name and the allowed CIDRs, warning when they open the whole Internet.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@ardc-ui/react";
import { fieldsFor } from "../../../../components/Form/fields";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import type {
  DbInstance,
  DbInstanceDetail,
} from "../../../../lib/api/types/databases";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { maxLength } from "../../../../lib/validation";
import { dbInstanceQuery, useUpdateInstance } from "../../api";
import {
  CIDR_WARNING,
  cidrsError,
  hasOpenCidr,
  splitCidrs,
} from "../../status";

const updateSchema = z.object({
  name: maxLength(80).min(1, "Enter an instance name"),
  allowed_cidrs: z.string().superRefine((text, ctx) => {
    const message = cidrsError(splitCidrs(text));
    if (message) ctx.addIssue({ code: "custom", message });
  }),
});

/**
 * Renames the instance and replaces its allowed CIDRs, which fill in once
 * the instance detail loads. Until then, or when the detail fails to load,
 * nothing can be sent: an update always replaces the CIDRs, so sending a
 * guess could open the database to networks the user never chose.
 */
export function UpdateInstanceDialog({
  instance,
  onClose,
}: {
  instance: DbInstance | DbInstanceDetail;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const detail = useQuery(dbInstanceQuery(projectId, instance.id));
  const loaded = useMemo(
    () => ({
      name: instance.name ?? "",
      allowed_cidrs: (detail.data?.allowed_cidrs ?? []).join("\n"),
    }),
    [instance.name, detail.data],
  );
  const { TextAreaInput, TextInput } =
    fieldsFor<z.infer<typeof updateSchema>>();
  const { form, dialog } = useMutationForm({
    schema: updateSchema,
    values: loaded,
    mutation: useUpdateInstance(),
    toVariables: (values) => ({
      id: instance.id,
      name: values.name,
      allowed_cidrs: splitCidrs(values.allowed_cidrs),
    }),
    successMessage: (_result, values) =>
      `Instance ${values.name} is being updated.`,
    onDone: onClose,
  });
  const typed = useWatch({ control: form.control, name: "allowed_cidrs" });
  return (
    <FormDialog
      {...dialog}
      title={`Update ${instance.name || instance.id}`}
      submitLabel="Update"
      isSubmitDisabled={!detail.isSuccess}
    >
      {detail.isPending ? (
        <SkeletonLines lines={3} />
      ) : detail.isError ? (
        <ErrorState
          error={detail.error}
          title="Could not load the allowed CIDRs"
          onRetry={() => void detail.refetch()}
        />
      ) : (
        <>
          <TextInput name="name" label="Instance name" isRequired />
          <TextAreaInput
            name="allowed_cidrs"
            label="Allowed CIDRs"
            description="One network per line. Only these networks can reach the database."
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
