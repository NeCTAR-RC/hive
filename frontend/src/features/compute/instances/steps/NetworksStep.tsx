// The launch wizard's networks step: the networks to plug into, their
// interface order, and any existing ports to attach.
import { useQuery } from "@tanstack/react-query";
import { useFormContext, useWatch } from "react-hook-form";
import { fieldsFor } from "../../../../components/Form/fields";
import { ReorderList } from "../../../../components/ReorderList/ReorderList";
import type { LaunchOptions } from "../../../../lib/api/types/compute";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { attachablePortsQuery } from "../../../network/api";
import { chosenNetworks } from "../launch";
import type { LaunchForm } from "../launchForm";
import { attachablePortLabel } from "../ports";
import styles from "../LaunchPage.module.scss";

const { CheckboxesInput } = fieldsFor<LaunchForm>();

/**
 * The networks, each labelled with its subnets and the classic network
 * marked as the one with a public IP, and the project's attachable ports
 * when it has any. With two or more networks chosen, their interface order
 * follows under the list, rearranged by dragging with the pointer or the
 * keyboard; the form keeps the networks in that order, as Horizon's
 * transfer table does, and the ports follow them. A port serves one
 * instance only, so with a count above one the ports not already chosen
 * are disabled and the group says why.
 */
export function NetworksStep({ data }: { data: LaunchOptions }) {
  const projectId = useProjectId();
  const form = useFormContext<LaunchForm>();
  const count = useWatch({ control: form.control, name: "count" }) || 1;
  const [chosenIds, chosenPorts] = useWatch({
    control: form.control,
    name: ["networks", "ports"],
  });
  // Ports are only offered when the project has some to attach.
  const ports = useQuery(attachablePortsQuery(projectId));
  const networks = (data.networks ?? []).map((network) => ({
    id: network.id,
    label: `${network.name}${network.is_classic ? " (classic, public IP)" : ""}${
      network.subnets.length
        ? `: ${network.subnets
            .map((s) => s.cidr)
            .filter(Boolean)
            .join(", ")}`
        : ""
    }`,
  }));
  const order = chosenNetworks(data.networks, chosenIds).map((network) => ({
    id: network.id,
    label: `${network.name}${network.isClassic ? " (classic)" : ""}`,
  }));
  const portOptions = (ports.data?.items ?? []).map((port) => ({
    id: port.id,
    label: attachablePortLabel(port),
    isDisabled: count > 1 && !chosenPorts.includes(port.id),
  }));
  return (
    <div className={styles.fields}>
      <CheckboxesInput
        name="networks"
        label="Networks"
        description="The instance gets an interface on each network you choose. The classic network gives it a public IP address."
        options={networks}
      />
      {order.length > 1 && (
        <div className={styles.order}>
          <p className={styles.hint}>
            Interface order: drag a network up or down, or press its handle and
            use the arrow keys. The first network becomes the instance's first
            interface; the operating system names the interfaces. Ports are
            attached after the networks.
          </p>
          <ReorderList
            aria-label="Interface order"
            items={order}
            onReorder={(ids) =>
              form.setValue("networks", ids, { shouldDirty: true })
            }
          />
        </div>
      )}
      {portOptions.length > 0 && (
        <CheckboxesInput
          name="ports"
          label="Existing ports"
          description={
            count > 1
              ? `A port can serve one instance only, so existing ports cannot be used for ${count} instances. Set Count to 1 on the Details step to attach one.`
              : "Attach ports you have already created."
          }
          options={portOptions}
        />
      )}
    </div>
  );
}
