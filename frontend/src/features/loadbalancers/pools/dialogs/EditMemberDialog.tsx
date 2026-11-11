// The dialog that edits a pool member (octavia-dashboard members step).
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { Member, Pool } from "../../../../lib/api/types/loadbalancers";
import { useUpdateMember } from "../../api";
import {
  editMemberBody,
  editMemberSchema,
  type EditMemberValues,
} from "./memberForm";

const { NumberInput, SwitchInput, TextInput } = fieldsFor<EditMemberValues>();

/** Edits `member` of `pool`; its address and port cannot change. */
export function EditMemberDialog({
  pool,
  member,
  onClose,
}: {
  pool: Pool;
  member: Member;
  onClose: () => void;
}) {
  const { dialog } = useMutationForm({
    schema: editMemberSchema,
    defaultValues: {
      name: member.name ?? "",
      weight: member.weight ?? 1,
      monitor_address: member.monitor_address ?? "",
      ...(member.monitor_port ? { monitor_port: member.monitor_port } : {}),
      backup: member.backup ?? false,
      admin_state_up: member.admin_state_up ?? true,
    },
    mutation: useUpdateMember(),
    toVariables: (v) => ({
      poolId: pool.id,
      memberId: member.id,
      ...editMemberBody(v),
    }),
    successMessage: "The member has been updated.",
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Edit member ${member.address}:${member.protocol_port}`}
      submitLabel="Save"
    >
      <p>The address and port cannot be changed.</p>
      <TextInput name="name" label="Name" />
      <NumberInput name="weight" label="Weight" minValue={0} maxValue={256} />
      <TextInput name="monitor_address" label="Monitor address" />
      <NumberInput
        name="monitor_port"
        label="Monitor port"
        minValue={1}
        maxValue={65535}
      />
      <SwitchInput name="backup" label="Backup member" />
      <SwitchInput name="admin_state_up" label="Admin state up" />
    </FormDialog>
  );
}
