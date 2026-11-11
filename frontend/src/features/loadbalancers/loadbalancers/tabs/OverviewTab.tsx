// The load balancer detail page's overview tab.
import { useQuery } from "@tanstack/react-query";
import { AppLink } from "../../../../components/AppLink/AppLink";
import { KeyValueList } from "../../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../../components/Panel/Panel";
import type { LoadBalancerTree } from "../../../../lib/api/types/loadbalancers";
import { formatDateTime } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { loadBalancerOptionsQuery } from "../../api";
import { flavourLabel } from "../../status";
import styles from "../../LoadBalancers.module.scss";

/**
 * The load balancer's settings, and its addresses with their port, subnet
 * and network linked. The flavour is named from the options' flavours, and
 * the subnet and network from the options' subnets, which list the
 * project's own; another project's shared subnet shows its id.
 */
export function OverviewTab({ tree }: { tree: LoadBalancerTree }) {
  const projectId = useProjectId();
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const lb = tree.load_balancer;
  const subnet = options.data?.subnets.find((s) => s.id === lb.vip_subnet_id);
  return (
    <div className={styles.grid}>
      <Panel title="Load balancer">
        <KeyValueList
          items={[
            { label: "ID", value: <code>{lb.id}</code> },
            { label: "Name", value: lb.name },
            { label: "Description", value: lb.description },
            { label: "Admin state", value: lb.admin_state_up ? "Up" : "Down" },
            { label: "Provider", value: lb.provider },
            {
              label: "Flavour",
              value: flavourLabel(lb, options.data?.flavors ?? []),
            },
            { label: "Availability zone", value: lb.availability_zone },
            { label: "Created", value: formatDateTime(lb.created_at) },
            { label: "Updated", value: formatDateTime(lb.updated_at) },
          ]}
        />
      </Panel>
      <Panel title="Addresses">
        <KeyValueList
          items={[
            { label: "VIP address", value: lb.vip_address },
            { label: "Floating IP", value: lb.floating_ip?.address ?? "None" },
            {
              label: "VIP port",
              value: lb.vip_port_id ? (
                <AppLink
                  to="/network/ports/$portId"
                  params={{ portId: lb.vip_port_id }}
                >
                  {lb.vip_port_id}
                </AppLink>
              ) : null,
            },
            {
              label: "VIP subnet",
              value: lb.vip_subnet_id ? (
                <AppLink
                  to="/network/subnets/$subnetId"
                  params={{ subnetId: lb.vip_subnet_id }}
                >
                  {subnet?.name || lb.vip_subnet_id}
                </AppLink>
              ) : null,
            },
            {
              label: "VIP network",
              value: lb.vip_network_id ? (
                <AppLink
                  to="/network/networks/$networkId"
                  params={{ networkId: lb.vip_network_id }}
                >
                  {subnet?.network_name || lb.vip_network_id}
                </AppLink>
              ) : null,
            },
          ]}
        />
      </Panel>
    </div>
  );
}
