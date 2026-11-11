// A port's allowed address pairs (Horizon's ports/extensions/
// allowed_address_pairs). Neutron keeps them as one list, so adding or
// deleting a pair sends the whole list that should remain.
import type { PortAddressPair } from "../../../lib/api/types/network";
import { isCidr, isIpAddress } from "../../../lib/net";

/** A pair's row id: its address and MAC address. */
export function pairId(pair: PortAddressPair): string {
  return `${pair.ip_address}|${pair.mac_address ?? ""}`;
}

/** `pairs` with `added` last, as Horizon's add form appends it. */
export function withPair(
  pairs: PortAddressPair[],
  added: PortAddressPair,
): PortAddressPair[] {
  return [...pairs, added];
}

/** `pairs` less every pair in `removed`, matched by address and MAC. */
export function withoutPairs(
  pairs: PortAddressPair[],
  removed: PortAddressPair[],
): PortAddressPair[] {
  const gone = new Set(removed.map(pairId));
  return pairs.filter((pair) => !gone.has(pairId(pair)));
}

const MAC_ADDRESS = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

/** Why `address` is not an IP address or address range, or null. */
export function checkPairAddress(address: string): string | null {
  const text = address.trim();
  if (!text) return "Enter an IP address or an address range";
  const ok = text.includes("/") ? isCidr(text) : isIpAddress(text);
  return ok
    ? null
    : "Enter an IP address such as 10.0.0.9, or a range such as 10.0.0.0/24";
}

/** Why `mac` (blank for the port's own) is not a MAC address, or null. */
export function checkPairMac(mac: string): string | null {
  const text = mac.trim();
  if (!text || MAC_ADDRESS.test(text)) return null;
  return "Enter a MAC address such as fa:16:3e:00:00:01";
}
