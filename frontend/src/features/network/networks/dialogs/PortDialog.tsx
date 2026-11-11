// Create a port on a network, or edit one.
import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { fieldsFor } from "../../../../components/Form/fields";
import type {
  Network,
  Port,
  PortCreateRequest,
  PortUpdateRequest,
} from "../../../../lib/api/types/network";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import {
  networkOptionsQuery,
  securityGroupsQuery,
  useCreatePort,
  useUpdatePort,
} from "../../api";
import { createPortRequest, updatePortRequest } from "./request";
import { portSchema, type PortValues } from "./schema";

/** What a port dialog saves: a new port, or the changed fields of one. */
type PortSave =
  | { kind: "create"; body: PortCreateRequest }
  | { kind: "update"; body: PortUpdateRequest & { portId: string } };

/**
 * The port dialog: creates a port on `network`, or edits `port` when one
 * is given. The device, address and MAC fields exist only on create; port
 * security and its groups show only where the cloud has the extension.
 */
export function PortDialog({
  network,
  port,
  onClose,
}: {
  network: Pick<Network, "id" | "name" | "subnets">;
  /** Present when editing. */
  port?: Port | undefined;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const isCreate = port === undefined;
  const options = useQuery(networkOptionsQuery(projectId));
  const groups = useQuery(securityGroupsQuery(projectId));
  const create = useCreatePort();
  const update = useUpdatePort();
  const portSecurity = options.data?.extensions?.port_security ?? true;
  const defaultGroups = useMemo(
    () =>
      (groups.data?.items ?? [])
        .filter((g) => g.name === "default")
        .map((g) => g.id),
    [groups.data],
  );
  // A new port starts with the default group once the list is known;
  // fields the user has already changed keep their values.
  const initial = useMemo<PortValues>(
    () => ({
      name: port?.name ?? "",
      admin_state_up: port?.admin_state_up ?? true,
      device_id: "",
      device_owner: "",
      specify_ip: "",
      subnet_id: "",
      fixed_ip: "",
      mac_address: "",
      port_security_enabled: port?.port_security_enabled ?? true,
      security_groups: port?.security_groups ?? defaultGroups,
    }),
    [port, defaultGroups],
  );
  // Creating and editing share one form: one save that sends the request to
  // whichever endpoint fits, so the dialog has one pending state and error.
  const save = useMutation({
    mutationFn: (request: PortSave) =>
      request.kind === "update"
        ? update.mutateAsync(request.body)
        : create.mutateAsync(request.body),
  });
  const { CheckboxesInput, RadioInput, SelectInput, SwitchInput, TextInput } =
    fieldsFor<PortValues>();
  const { form, dialog } = useMutationForm({
    schema: portSchema,
    values: initial,
    mutation: save,
    toVariables: (values): PortSave | null => {
      if (port) {
        const body = updatePortRequest(port, values, portSecurity);
        return body ? { kind: "update", body } : null;
      }
      return {
        kind: "create",
        body: createPortRequest(network.id, values, portSecurity),
      };
    },
    successMessage: (saved) =>
      port
        ? `Port ${saved.name || saved.id} updated.`
        : `Created port ${saved.name || saved.id} on ${network.name}.`,
    onDone: onClose,
  });
  const specifyIp = useWatch({ control: form.control, name: "specify_ip" });
  const securityOn = useWatch({
    control: form.control,
    name: "port_security_enabled",
  });

  return (
    <FormDialog
      {...dialog}
      title={
        port
          ? `Edit port ${port.name || port.id}`
          : `Create port on ${network.name}`
      }
      submitLabel={port ? "Save" : "Create port"}
      size="lg"
    >
      <TextInput name="name" label="Port name" />
      <SwitchInput
        name="admin_state_up"
        label="Enable admin state (the port is up)"
      />
      {isCreate && (
        <>
          <TextInput
            name="device_id"
            label="Device ID"
            description="Optional. The device the port is attached to."
          />
          <TextInput
            name="device_owner"
            label="Device owner"
            description="Optional. The owner of the attached device."
          />
          {network.subnets.length > 0 && (
            <RadioInput
              name="specify_ip"
              label="Address"
              options={[
                { id: "", label: "Any address (neutron picks one)" },
                { id: "subnet", label: "An address on a chosen subnet" },
                { id: "fixed", label: "A fixed IP address" },
              ]}
            />
          )}
          {specifyIp === "subnet" && (
            <SelectInput
              name="subnet_id"
              label="Subnet"
              options={network.subnets.map((s) => ({
                id: s.id,
                label: `${s.name || s.id} ${s.cidr ?? ""}`.trim(),
              }))}
              isRequired
              placeholder="Choose a subnet"
            />
          )}
          {specifyIp === "fixed" && (
            <TextInput name="fixed_ip" label="Fixed IP address" isRequired />
          )}
          <TextInput
            name="mac_address"
            label="MAC address"
            description="Optional. Leave blank to have one generated."
          />
        </>
      )}
      {portSecurity && (
        <SwitchInput
          name="port_security_enabled"
          label="Port security (anti-spoofing rules and security groups)"
        />
      )}
      {portSecurity && securityOn && (
        <CheckboxesInput
          name="security_groups"
          label="Security groups"
          options={(groups.data?.items ?? []).map((g) => ({
            id: g.id,
            label: g.name,
            ...(g.description ? { description: g.description } : {}),
          }))}
          description={
            groups.isPending
              ? "Loading security groups..."
              : "The default group applies unless you remove it."
          }
        />
      )}
    </FormDialog>
  );
}
