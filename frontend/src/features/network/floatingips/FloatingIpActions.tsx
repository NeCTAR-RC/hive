// Every floating IP action behind one hook: `run(action, fips)` releases
// or disassociates the batch after asking, opens the associate form, or
// goes to the IP's port forwarding rules. The hook returns the dialogs to
// render and the props for the table that lists the IPs.
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { RELEASE, type Verb } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import type { FloatingIp } from "../../../lib/api/types/network";
import {
  disassociateFloatingIp,
  floatingIpWriteKeys,
  releaseFloatingIp,
} from "../api";
import { availableFloatingIpActions, type FloatingIpActionId } from "../status";
import { AssociateFloatingIpDialog } from "./dialogs/AssociateFloatingIpDialog";

const DISASSOCIATE: Verb = {
  label: "Disassociate",
  done: "Disassociated",
  failed: "disassociate",
};

/** The address, as titles and toasts name the IP. */
const address = (fip: FloatingIp) => fip.floating_ip_address ?? fip.id;

/**
 * Every floating IP action: release and disassociate run on a batch,
 * associate opens its form for the first IP, and the port forwarding
 * action opens that IP's rules.
 */
export function useFloatingIpActions() {
  const navigate = useNavigate();
  const [associating, setAssociating] = useState<FloatingIp | null>(null);
  const bulk = useBulkAction<FloatingIp, "release" | "disassociate">({
    noun: { one: "floating IP", many: "floating IPs" },
    name: address,
    getId: (fip) => fip.id,
    invalidates: floatingIpWriteKeys,
    actions: {
      release: {
        verb: RELEASE,
        request: (fip) => releaseFloatingIp(fip.id),
        eligible: (fip) => allows(availableFloatingIpActions(fip), "release"),
        skippedWhy: "they still have port forwarding rules",
        body: (
          <p>
            Once a floating IP is released there is no guarantee the same
            address can be allocated again.
          </p>
        ),
      },
      disassociate: {
        verb: DISASSOCIATE,
        request: (fip) => disassociateFloatingIp(fip.id),
        eligible: (fip) =>
          allows(availableFloatingIpActions(fip), "disassociate"),
        skippedWhy: "they are not associated",
        title: (fips) =>
          fips.length === 1 && fips[0]
            ? `Disassociate ${address(fips[0])}?`
            : `Disassociate ${fips.length} floating IPs?`,
        body: (fips) => {
          const instance = fips.length === 1 ? fips[0]?.instance_name : null;
          return (
            <p>
              The {fips.length === 1 ? "address stays" : "addresses stay"}{" "}
              allocated to the project
              {instance ? ` but no longer reaches ${instance}` : ""}.
            </p>
          );
        },
      },
    },
  });

  const run = (action: FloatingIpActionId, fips: FloatingIp[]) => {
    const [first] = fips;
    if (action === "release" || action === "disassociate") {
      bulk.run(action, fips);
    } else if (!first) {
      return;
    } else if (action === "associate") {
      setAssociating(first);
    } else {
      void navigate({
        to: "/network/port-forwardings",
        search: { floating_ip: first.id },
      });
    }
  };

  return {
    run,
    dialogs: (
      <>
        {associating && (
          <AssociateFloatingIpDialog
            floatingIp={associating}
            onClose={() => setAssociating(null)}
          />
        )}
        {bulk.dialog}
      </>
    ),
    tableProps: bulk.tableProps,
  };
}
