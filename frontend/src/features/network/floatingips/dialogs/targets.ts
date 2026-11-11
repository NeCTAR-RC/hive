// How the associate dialog lists the port addresses a floating IP can go
// to: each one that already has a floating IP says which, so the user
// sees that choosing it moves traffic or is refused.
import type {
  FloatingIp,
  FloatingIpTarget,
} from "../../../../lib/api/types/network";

/**
 * The target picker's options: "db-1 10.0.0.5", with "(already has
 * 203.0.113.100)" where another floating IP maps that port address.
 * `floatingIpId` is the IP being associated, which never counts.
 */
export function targetOptions(
  targets: FloatingIpTarget[],
  floatingIps: FloatingIp[],
  floatingIpId?: string,
): { id: string; label: string }[] {
  return targets.map((target) => {
    const taken = floatingIps.find(
      (fip) =>
        fip.id !== floatingIpId &&
        fip.port_id === target.port_id &&
        fip.fixed_ip_address === target.ip_address,
    );
    return {
      id: target.id,
      label: taken
        ? `${target.name} (already has ${taken.floating_ip_address})`
        : target.name,
    };
  });
}
