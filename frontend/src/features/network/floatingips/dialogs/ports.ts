// The port fields of a port forwarding rule: a port, or a range written
// start:end (the form Neutron takes), and how the two sides pair up.
import { isPort, parsePortRange } from "../../../../lib/net";

/** A port or a start:end range of ports; Neutron takes no other form. */
const PORT_TEXT = /^\d{1,5}(:\d{1,5})?$/;

/** Why `value` is not a usable port or port range, or null when it is. */
export function checkPorts(value: string): string | null {
  const text = value.trim();
  if (!PORT_TEXT.test(text)) return "Enter a port, or a range as start:end";
  if (!text.split(":").map(Number).every(isPort)) {
    return "Ports run from 1 to 65535";
  }
  if (!parsePortRange(text)) return "The range start must not be after its end";
  return null;
}

/**
 * Why the internal side cannot pair with the external one, or null. With
 * Neutron's port ranges an external range goes to one internal port (N:1)
 * or to an internal range of the same length (N:N); a single external
 * port goes to a single internal port. Two sides that are not valid ports
 * yet are left to `checkPorts`.
 */
export function checkPortPairing(
  external: string,
  internal: string,
): string | null {
  const outside = parsePortRange(external);
  const inside = parsePortRange(internal);
  if (!outside || !inside) return null;
  const length = (range: { min: number; max: number }) =>
    range.max - range.min + 1;
  const wanted = length(outside);
  if (length(inside) === 1 || length(inside) === wanted) return null;
  return wanted === 1
    ? "The internal port must be a single port, as the external one is"
    : `The internal port must be a single port or a range of ${wanted} ports, as long as the external one`;
}
