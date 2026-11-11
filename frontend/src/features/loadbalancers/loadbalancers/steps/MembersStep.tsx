// The create load balancer wizard's members step.
import { useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button, Card, Label, Select, SelectItem } from "@ardc-ui/react";
import { fieldsFor } from "../../../../components/Form/fields";
import { memberDefaultPort, poolProtocolFor } from "../../status";
import type { CreateForm, CreateStepProps } from "../createForm";
import styles from "../../LoadBalancers.module.scss";

const { NumberInput, SelectInput, SwitchInput, TextInput } =
  fieldsFor<CreateForm>();

/**
 * The pool's members, added from an instance's address or as an external
 * address, each on port 80 in an HTTP pool and on a port the user enters
 * otherwise (octavia-dashboard's member default). Members need the pool,
 * so the step only says so while the pool is off.
 */
export function MembersStep({ data }: CreateStepProps) {
  const form = useFormContext<CreateForm>();
  const [enabled, listenerProtocol] = useWatch({
    control: form.control,
    name: ["create_pool", "listener.protocol"],
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "members",
  });
  const [picked, setPicked] = useState<string>("");
  const port = memberDefaultPort(poolProtocolFor(listenerProtocol)) ?? null;
  const instanceOptions = data.instances.flatMap((instance) =>
    instance.addresses.map((address) => ({
      id: `${instance.id}|${address.address}|${address.subnet_id}`,
      label: `${instance.name ?? instance.id}: ${address.address}`,
    })),
  );
  if (!enabled) {
    return <p>Members belong to a pool. Turn the pool on to add members.</p>;
  }
  const addInstance = () => {
    const [, address, subnet] = picked.split("|");
    const instance = data.instances.find((i) => picked.startsWith(`${i.id}|`));
    if (!address) return;
    append({
      name: instance?.name ?? "",
      address,
      subnet_id: subnet ?? "",
      protocol_port: port,
      weight: 1,
      backup: false,
    });
    setPicked("");
  };
  return (
    <div className={styles.fields}>
      <div className={styles.addMembers}>
        <Select
          selectedKey={picked || null}
          onSelectionChange={(key) => setPicked(key ? String(key) : "")}
          placeholder={
            instanceOptions.length
              ? "Choose an instance"
              : "No instances with addresses on the subnets"
          }
          isDisabled={instanceOptions.length === 0}
        >
          <Label>Available instances</Label>
          {instanceOptions.map((option) => (
            <SelectItem key={option.id} id={option.id} textValue={option.label}>
              {option.label}
            </SelectItem>
          ))}
        </Select>
        <div className={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            onPress={addInstance}
            isDisabled={!picked}
          >
            Add instance
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onPress={() =>
              append({
                name: "",
                address: "",
                subnet_id: "",
                protocol_port: port,
                weight: 1,
                backup: false,
              })
            }
          >
            Add external member
          </Button>
        </div>
      </div>
      {fields.length === 0 ? (
        <p className={styles.note}>
          No members yet. The pool can be created without members.
        </p>
      ) : (
        <ol className={styles.memberList} aria-label="Members">
          {fields.map((field, index) => (
            <li key={field.id}>
              <Card tone="grey">
                <div className={styles.member}>
                  <TextInput
                    name={`members.${index}.address`}
                    label="IP address"
                    isRequired
                  />
                  <SelectInput
                    name={`members.${index}.subnet_id`}
                    label="Subnet"
                    options={[
                      { id: "", label: "None" },
                      ...data.subnets.map((s) => ({
                        id: s.id,
                        label: `${s.name ?? s.id} (${s.cidr ?? ""})`,
                      })),
                    ]}
                  />
                  <NumberInput
                    name={`members.${index}.protocol_port`}
                    label="Port"
                    minValue={1}
                    maxValue={65535}
                    isRequired
                  />
                  <NumberInput
                    name={`members.${index}.weight`}
                    label="Weight"
                    minValue={0}
                    maxValue={256}
                  />
                  <SwitchInput
                    name={`members.${index}.backup`}
                    label="Backup member"
                  />
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      size="xs"
                      onPress={() => remove(index)}
                    >
                      Remove member
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
