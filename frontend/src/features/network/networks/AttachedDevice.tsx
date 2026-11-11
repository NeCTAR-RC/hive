// A port's attached device: a link to the instance or router behind it,
// or Horizon's owner string for any other device.
import { AppLink } from "../../../components/AppLink/AppLink";
import type { Port } from "../../../lib/api/types/network";
import { portAttachmentLabel, portDevice } from "../status";

/**
 * "Instance web-1" or "Router default" with the name linking to its page;
 * the raw owner ("network:dhcp") or "Detached" otherwise.
 */
export function AttachedDevice({
  port,
  size,
}: {
  port: Port;
  /** The link size: "sm" inside tables. */
  size?: "sm";
}) {
  const device = portDevice(port);
  if (!device) return <>{portAttachmentLabel(port)}</>;
  return device.kind === "instance" ? (
    <>
      {"Instance "}
      <AppLink
        size={size}
        to="/compute/instances/$instanceId"
        params={{ instanceId: device.id }}
        search={{}}
      >
        {device.name}
      </AppLink>
    </>
  ) : (
    <>
      {"Router "}
      <AppLink
        size={size}
        to="/network/routers/$routerId"
        params={{ routerId: device.id }}
        search={{}}
      >
        {device.name}
      </AppLink>
    </>
  );
}
