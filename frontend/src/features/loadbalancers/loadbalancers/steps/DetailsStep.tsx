// The create load balancer wizard's first step: the load balancer itself.
import { fieldsFor } from "../../../../components/Form/fields";
import type { CreateForm, CreateStepProps } from "../createForm";
import styles from "../../LoadBalancers.module.scss";

const { SelectInput, SwitchInput, TextAreaInput, TextInput } =
  fieldsFor<CreateForm>();

/**
 * The name, the subnet the VIP is taken from and an optional address on it;
 * the availability zone and flavour show only when the cloud offers any.
 */
export function DetailsStep({ data }: CreateStepProps) {
  return (
    <div className={styles.fields}>
      <TextInput name="name" label="Name" />
      <TextAreaInput name="description" label="Description" />
      <SelectInput
        name="vip_subnet_id"
        label="Subnet"
        description="The subnet the load balancer's address is taken from."
        options={data.subnets.map((s) => ({
          id: s.id,
          label: `${s.network_name ?? s.network_id}: ${s.cidr ?? ""} (${s.name ?? s.id})`,
        }))}
        isRequired
      />
      <TextInput
        name="vip_address"
        label="IP address"
        description="Optional; an address on the subnet to use for the VIP."
      />
      {data.availability_zones.length > 0 && (
        <SelectInput
          name="availability_zone"
          label="Availability zone"
          options={[
            { id: "", label: "Any" },
            ...data.availability_zones.map((z) => ({
              id: z.name,
              label: z.name,
            })),
          ]}
        />
      )}
      {data.flavors.length > 0 && (
        <SelectInput
          name="flavor_id"
          label="Flavour"
          options={[
            { id: "", label: "Default" },
            ...data.flavors.map((f) => ({
              id: f.id,
              label: f.description ? `${f.name}: ${f.description}` : f.name,
            })),
          ]}
        />
      )}
      <SwitchInput name="admin_state_up" label="Admin state up" />
    </div>
  );
}
