// The subnet fields the create network, create subnet and edit subnet
// dialogs share.
import { fieldsFor } from "../../../../components/Form/fields";
import type { NetworkOptions } from "../../../../lib/api/types/network";
import { IPV6_MODES, type SubnetFormValues } from "../subnetRules";
import styles from "../../DialogGroups.module.scss";

/**
 * The subnet fields: the address (typed, or from a pool when creating),
 * the gateway, then DHCP and the one-entry-per-line details. `prefix`
 * nests them under a form object key; `watch` carries the values that
 * decide which fields show.
 */
export function SubnetFields<
  T extends { subnet: SubnetFormValues } | SubnetFormValues,
>({
  prefix,
  options,
  isCreate,
  watch,
}: {
  prefix: "subnet." | "";
  options: NetworkOptions | undefined;
  isCreate: boolean;
  watch: Pick<
    SubnetFormValues,
    "address_source" | "no_gateway" | "cidr" | "ip_version"
  >;
}) {
  const { RadioInput, SelectInput, SwitchInput, TextAreaInput, TextInput } =
    fieldsFor<T>();
  type Name = Parameters<typeof TextInput>[0]["name"];
  type SwitchName = Parameters<typeof SwitchInput>[0]["name"];
  const field = (name: keyof SubnetFormValues) => `${prefix}${name}` as Name;
  const switchField = (name: "no_gateway" | "enable_dhcp") =>
    `${prefix}${name}` as SwitchName;
  const pools = options?.subnetpools ?? [];
  const enableIpv6 = options?.enable_ipv6 ?? false;
  return (
    <div className={styles.groups}>
      <div className={styles.group}>
        <TextInput name={field("name")} label="Subnet name" />
        {isCreate && pools.length > 0 && (
          <RadioInput
            name={field("address_source")}
            label="Network address source"
            options={[
              { id: "manual", label: "Enter the network address manually" },
              { id: "pool", label: "Allocate the network address from a pool" },
            ]}
          />
        )}
        {isCreate && watch.address_source === "pool" ? (
          <>
            <SelectInput
              name={field("subnetpool_id")}
              label="Address pool"
              options={pools.map((p) => ({
                id: p.id,
                label: p.prefixes.length
                  ? `${p.name} (${p.prefixes.join(", ")})`
                  : p.name,
              }))}
              isRequired
              placeholder="Choose a pool"
            />
            <TextInput
              name={field("prefixlen")}
              label="Network mask length"
              description="Leave blank for the pool's default prefix length."
            />
          </>
        ) : (
          <TextInput
            name={field("cidr")}
            label="Network address"
            isRequired={isCreate}
            isDisabled={!isCreate}
            description={
              isCreate
                ? "In CIDR form, such as 192.168.0.0/24."
                : "The address cannot change once the subnet exists."
            }
          />
        )}
        {isCreate && enableIpv6 && (
          <RadioInput
            name={field("ip_version")}
            label="IP version"
            options={[
              { id: "4", label: "IPv4" },
              { id: "6", label: "IPv6" },
            ]}
          />
        )}
        {isCreate && enableIpv6 && watch.ip_version === "6" && (
          <SelectInput
            name={field("ipv6_modes")}
            label="IPv6 address configuration mode"
            options={IPV6_MODES.map((mode) => ({
              id: mode.id,
              label: mode.label,
            }))}
            description="How instances get their IPv6 address and settings: from an OpenStack router (SLAAC), from OpenStack DHCP, or by other means."
          />
        )}
        {!watch.no_gateway && (
          <TextInput
            name={field("gateway_ip")}
            label="Gateway IP"
            description="Leave blank for the first address of the network (192.168.0.1 for 192.168.0.0/24). It must lie inside the network address."
          />
        )}
        <SwitchInput name={switchField("no_gateway")} label="Disable gateway" />
      </div>
      <div className={styles.group}>
        <h3 className={styles.heading}>Subnet details</h3>
        <SwitchInput name={switchField("enable_dhcp")} label="Enable DHCP" />
        <TextAreaInput
          name={field("allocation_pools")}
          label="Allocation pools"
          description="One pool per line as start,end (192.168.1.100,192.168.1.120). Blank for the whole range."
        />
        <TextAreaInput
          name={field("dns_nameservers")}
          label="DNS name servers"
          description="One IP address per line."
        />
        <TextAreaInput
          name={field("host_routes")}
          label="Host routes"
          description="One route per line as destination,nexthop (192.168.200.0/24,10.56.1.254)."
        />
      </div>
    </div>
  );
}
