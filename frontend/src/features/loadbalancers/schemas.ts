// The listener, pool, member and health monitor rules (octavia-dashboard's
// listener, pool, members and monitor workflow steps), and the VIP address
// rule, written once. The create wizard nests them under `listener`,
// `pool`, `members` and `monitor` and applies a part only when it is
// switched on; the dialogs spread the fields they edit into their own
// schemas and refine with the same functions.
import { z } from "zod";
import { inCidr, isCidr, isIpAddress } from "../../lib/net";
import { maxLength } from "../../lib/validation";
import { EXPECTED_CODES, URL_PATH } from "./status";

/** Where a refinement reports: the form's path to the part it checks. */
type Path = (string | number)[];

/** Raises one error on `field` of the part at `at`. */
function report(
  ctx: z.RefinementCtx,
  at: Path,
  field: string,
  message: string,
) {
  ctx.addIssue({ code: "custom", path: [...at, field], message });
}

const PORT_RANGE = "Ports run from 1 to 65535";

/**
 * A required port, with messages that read well under the field. An empty
 * field holds null (or undefined once a typed port is cleared), as the
 * number field holds it, and answers "Enter a port". A protocol without a
 * default port empties the field with null: react-hook-form shows a
 * field's default again when its value is undefined.
 */
const port = z
  .number({ error: "Enter a port" })
  .int()
  .min(1, PORT_RANGE)
  .max(65535, PORT_RANGE)
  .nullish()
  // Typed boolean, so the field's type stays what the form holds.
  .refine((value): boolean => value != null, "Enter a port");

/** A port as a form holds it: a number, or null while the field is empty. */
export type PortValue = number | null | undefined;

/**
 * The port of a form that passed the port rule, for the request it
 * becomes; an empty port never gets that far.
 */
export function enteredPort(value: PortValue): number {
  if (value == null) throw new Error("The port rule lets no empty port by");
  return value;
}

/** A listener's fields, as the wizard and the create dialog ask for them. */
export const listenerFields = {
  name: maxLength(255),
  protocol: z.string(),
  protocol_port: port,
  connection_limit: z.number().int().min(-1),
  allowed_cidrs: z.string().trim(),
  xff: z.boolean(),
  xfp: z.boolean(),
  xfproto: z.boolean(),
  tls_ref: z.string().trim(),
};

/** A listener's timeouts in milliseconds, asked for on create and edit. */
export const listenerTimeoutFields = {
  timeout_client_data: z.number().int().min(0),
  timeout_member_connect: z.number().int().min(0),
  timeout_member_data: z.number().int().min(0),
  timeout_tcp_inspect: z.number().int().min(0),
};

/** The entries of a list typed one per line or space (CIDRs, references). */
export function listEntries(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * The listener rules: a protocol is chosen, a terminated HTTPS listener
 * names its certificate, and every allowed source is a CIDR. A form without
 * the protocol (editing, where it is fixed) skips the first two.
 */
export function refineListener(
  values: { protocol?: string; tls_ref?: string; allowed_cidrs: string },
  ctx: z.RefinementCtx,
  at: Path = [],
) {
  if (values.protocol === "") {
    report(ctx, at, "protocol", "Choose a protocol");
  }
  if (values.protocol === "TERMINATED_HTTPS" && !values.tls_ref) {
    report(ctx, at, "tls_ref", "Enter the certificate reference");
  }
  const invalid = listEntries(values.allowed_cidrs).find((c) => !isCidr(c));
  if (invalid !== undefined) {
    report(ctx, at, "allowed_cidrs", `"${invalid}" is not a CIDR`);
  }
}

/** A subnet a VIP or a member address can be on: its id, name and CIDR. */
export interface SubnetRange {
  id: string;
  name: string | null;
  cidr: string | null;
}

/** "private (192.168.1.0/24)": a subnet as a message names it. */
function subnetText(subnet: SubnetRange): string {
  return `${subnet.name || subnet.id} (${subnet.cidr ?? ""})`;
}

/**
 * Why `address` cannot be used on the chosen subnet, or null when it can:
 * it must be an IP address, and lie inside the subnet's CIDR when a subnet
 * with a known CIDR is chosen. Octavia refuses an address off its subnet
 * only once the whole request is sent.
 */
export function addressProblem(
  address: string,
  subnetId: string,
  subnets: readonly SubnetRange[],
): string | null {
  if (!isIpAddress(address)) return "Enter a valid IP address";
  const subnet = subnets.find((s) => s.id === subnetId);
  if (subnet?.cidr && !inCidr(address, subnet.cidr)) {
    return `Use an address on the subnet ${subnetText(subnet)}`;
  }
  return null;
}

/** A member's fields, as the wizard and the add member dialog ask for them. */
export const memberFields = {
  name: maxLength(255),
  address: z.string().trim().min(1, "Enter an IP address"),
  subnet_id: z.string(),
  protocol_port: port,
  weight: z.number().int().min(0).max(256),
  backup: z.boolean(),
};

/**
 * The member rule: the address is an IP address on the member's subnet,
 * checked against the subnets the options list (`addressProblem`).
 */
export function refineMember(
  values: { address: string; subnet_id: string },
  subnets: readonly SubnetRange[],
  ctx: z.RefinementCtx,
  at: Path = [],
) {
  if (!values.address) return;
  const problem = addressProblem(values.address, values.subnet_id, subnets);
  if (problem) report(ctx, at, "address", problem);
}

/** An optional address: blank, or an IP address ("Enter a valid IP address"). */
export const optionalIpAddress = z
  .string()
  .trim()
  .refine((v) => !v || isIpAddress(v), "Enter a valid IP address");

/** A pool's fields, as the wizard and the pool dialogs ask for them. */
export const poolFields = {
  name: maxLength(255),
  lb_algorithm: z.string(),
  persistence: z.string(),
  cookie_name: z.string().trim(),
};

/**
 * The pool rules: an algorithm is chosen, and application cookie
 * persistence names its cookie.
 */
export function refinePool(
  values: { lb_algorithm: string; persistence: string; cookie_name: string },
  ctx: z.RefinementCtx,
  at: Path = [],
) {
  if (!values.lb_algorithm) {
    report(ctx, at, "lb_algorithm", "Choose an algorithm");
  }
  if (values.persistence === "APP_COOKIE" && !values.cookie_name) {
    report(ctx, at, "cookie_name", "Enter the cookie name");
  }
}

/** A health monitor's fields, as the wizard and the monitor dialog ask. */
export const monitorFields = {
  type: z.string(),
  delay: z.number().int().min(0),
  timeout: z.number().int().min(0),
  max_retries: z.number().int().min(1).max(10),
  max_retries_down: z.number().int().min(1).max(10),
  http_method: z.string(),
  url_path: z.string().trim(),
  expected_codes: z.string().trim(),
};

/** Whether a monitor type probes over HTTP, so has a path and codes. */
export function isHttpMonitor(type: string): boolean {
  return ["HTTP", "HTTPS"].includes(type);
}

/**
 * The monitor rules: a type is chosen, the delay is at least the timeout,
 * and an HTTP monitor's expected codes and path are well formed (blank
 * reads as Octavia's defaults, 200 and "/").
 */
export function refineMonitor(
  values: {
    type: string;
    delay: number;
    timeout: number;
    url_path: string;
    expected_codes: string;
  },
  ctx: z.RefinementCtx,
  at: Path = [],
) {
  if (!values.type) {
    report(ctx, at, "type", "Choose a monitor type");
  }
  if (values.delay < values.timeout) {
    report(ctx, at, "delay", "The delay must be at least the timeout");
  }
  if (!isHttpMonitor(values.type)) return;
  if (!EXPECTED_CODES.test(values.expected_codes || "200")) {
    report(
      ctx,
      at,
      "expected_codes",
      "A code, a range (200-204) or a list (200,301)",
    );
  }
  if (!URL_PATH.test(values.url_path || "/")) {
    report(ctx, at, "url_path", "The path must start with a slash");
  }
}
