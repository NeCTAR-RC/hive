// The dialog that adds a rule to an L7 policy or edits one of its rules
// (octavia-dashboard workflow/l7rule, believed: the plugin is not checked
// out here).
import { useMutation, useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { L7Policy, L7Rule } from "../../../../lib/api/types/loadbalancers";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { humanise } from "../../../../lib/status";
import {
  loadBalancerOptionsQuery,
  useCreateL7Rule,
  useUpdateL7Rule,
} from "../../api";
import {
  COMPARE_TYPES,
  comparisonsFor,
  hasKey,
  RULE_TYPES,
  ruleBody,
  ruleDefaults,
  ruleSchema,
  ruleUpdateBody,
  type RuleValues,
} from "./ruleForm";

const { SelectInput, SwitchInput, TextInput } = fieldsFor<RuleValues>();

/**
 * Adds a rule to `policy`, or edits `rule` when one is given. The
 * comparison offers only what the rule type allows, and a type change
 * that rules out the current comparison picks the first allowed one; a
 * header or cookie rule also asks for its key.
 */
export function L7RuleDialog({
  policy,
  rule,
  onClose,
}: {
  policy: L7Policy;
  rule: L7Rule | null;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const create = useCreateL7Rule();
  const update = useUpdateL7Rule();
  // Creates or updates as one save, so the dialog has one pending state
  // and one error.
  const save = useMutation({
    mutationFn: (values: RuleValues) =>
      rule
        ? update.mutateAsync({
            policyId: policy.id,
            ruleId: rule.id,
            ...ruleUpdateBody(values),
          })
        : create.mutateAsync({ policyId: policy.id, ...ruleBody(values) }),
  });
  const { form, dialog } = useMutationForm({
    schema: ruleSchema,
    defaultValues: ruleDefaults(rule),
    mutation: save,
    toVariables: (values) => values,
    successMessage: rule
      ? "The rule has been updated."
      : "A new rule is being created.",
    onDone: onClose,
  });
  const type = useWatch({ control: form.control, name: "type" });
  const offeredComparisons = options.data?.l7_compare_types ?? COMPARE_TYPES;
  const policyName = policy.name || policy.id;
  return (
    <FormDialog
      {...dialog}
      title={rule ? `Edit rule of ${policyName}` : `Add rule to ${policyName}`}
      submitLabel={rule ? "Save" : "Add rule"}
    >
      <SelectInput
        name="type"
        label="Type"
        options={(options.data?.l7_rule_types ?? RULE_TYPES).map((t) => ({
          id: t,
          label: humanise(t),
        }))}
        isRequired
        onValueChange={(value) => {
          const allowed = comparisonsFor(value, offeredComparisons);
          if (!allowed.includes(form.getValues("compare_type"))) {
            form.setValue("compare_type", allowed[0] ?? "", {
              shouldDirty: true,
            });
          }
        }}
      />
      <SelectInput
        name="compare_type"
        label="Comparison"
        options={comparisonsFor(type, offeredComparisons).map((t) => ({
          id: t,
          label: humanise(t),
        }))}
        isRequired
      />
      {hasKey(type) && <TextInput name="key" label="Key" isRequired />}
      <TextInput name="value" label="Value" isRequired />
      <SwitchInput name="invert" label="Invert the match" />
      <SwitchInput name="admin_state_up" label="Admin state up" />
    </FormDialog>
  );
}
