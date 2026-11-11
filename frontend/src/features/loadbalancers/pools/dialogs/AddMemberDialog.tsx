// The dialog that adds a member to a pool (octavia-dashboard members step).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label, Select, SelectItem } from "@ardc-ui/react";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { Pool } from "../../../../lib/api/types/loadbalancers";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { loadBalancerOptionsQuery, useAddMember } from "../../api";
import { memberDefaultPort } from "../../status";
import {
  addMemberBody,
  addMemberSchema,
  type AddMemberValues,
} from "./memberForm";

const { NumberInput, SelectInput, SwitchInput, TextInput } =
  fieldsFor<AddMemberValues>();

/**
 * Adds a member to `pool` on load balancer `lbId`, on port 80 in an HTTP
 * pool and on a port the user enters otherwise. Picking an instance fills
 * in its address and subnet, and its name when none is typed yet.
 */
export function AddMemberDialog({
  lbId,
  pool,
  onClose,
}: {
  lbId: string;
  pool: Pool;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const [picked, setPicked] = useState("");
  const schema = useMemo(
    () => addMemberSchema(options.data?.subnets ?? []),
    [options.data],
  );
  const { form, dialog } = useMutationForm({
    schema,
    defaultValues: {
      name: "",
      address: "",
      subnet_id: "",
      protocol_port: memberDefaultPort(pool.protocol ?? "") ?? null,
      weight: 1,
      monitor_address: "",
      backup: false,
      admin_state_up: true,
    },
    mutation: useAddMember(),
    toVariables: (v) => ({ lbId, poolId: pool.id, ...addMemberBody(v) }),
    successMessage: "Adding the member.",
    onDone: onClose,
  });
  const instanceOptions = (options.data?.instances ?? []).flatMap((instance) =>
    instance.addresses.map((a) => ({
      id: `${instance.id}|${a.address}|${a.subnet_id}`,
      label: `${instance.name ?? instance.id}: ${a.address}`,
      name: instance.name ?? "",
    })),
  );
  const pick = (key: string) => {
    setPicked(key);
    const option = instanceOptions.find((o) => o.id === key);
    if (!option) return;
    const [, address, subnet] = key.split("|");
    form.setValue("address", address ?? "");
    form.setValue("subnet_id", subnet ?? "");
    if (!form.getValues("name")) form.setValue("name", option.name);
  };
  return (
    <FormDialog
      {...dialog}
      title="Add member"
      submitLabel="Add member"
      size="lg"
    >
      <Select
        selectedKey={picked || null}
        onSelectionChange={(key) => pick(key ? String(key) : "")}
        placeholder={
          instanceOptions.length
            ? "Choose an instance to fill in its address"
            : "No instances with addresses on the subnets"
        }
        isDisabled={instanceOptions.length === 0}
      >
        <Label>From an instance</Label>
        {instanceOptions.map((o) => (
          <SelectItem key={o.id} id={o.id} textValue={o.label}>
            {o.label}
          </SelectItem>
        ))}
      </Select>
      <TextInput name="name" label="Name" />
      <TextInput name="address" label="IP address" isRequired />
      <SelectInput
        name="subnet_id"
        label="Subnet"
        options={[
          { id: "", label: "None" },
          ...(options.data?.subnets ?? []).map((s) => ({
            id: s.id,
            label: `${s.name ?? s.id} (${s.cidr ?? ""})`,
          })),
        ]}
      />
      <NumberInput
        name="protocol_port"
        label="Port"
        minValue={1}
        maxValue={65535}
        isRequired
      />
      <NumberInput name="weight" label="Weight" minValue={0} maxValue={256} />
      <TextInput
        name="monitor_address"
        label="Monitor address"
        description="Optional alternate address for health checks."
      />
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
