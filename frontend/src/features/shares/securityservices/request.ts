// Pure rules of the security service dialogs: the create and edit
// requests built from the form's values.
import type {
  SecurityService,
  SecurityServiceRequest,
  SecurityServiceUpdate,
} from "../../../lib/api/types/shares";

/** The security service form's values, as its schema parses them. */
export interface SecurityServiceValues {
  name: string;
  type: string;
  dns_ip: string;
  server: string;
  domain: string;
  ou: string;
  user: string;
  password: string;
  confirm_password: string;
  description: string;
}

const OPTIONAL_FIELDS = [
  "dns_ip",
  "server",
  "domain",
  "ou",
  "user",
  "description",
] as const;

/** The create request: empty optional fields are left out. */
export function createSecurityServiceBody(
  values: SecurityServiceValues,
): SecurityServiceRequest {
  return {
    name: values.name,
    // The type select offers only SECURITY_SERVICE_TYPES, whose ids the
    // contract checks there.
    type: values.type as SecurityServiceRequest["type"],
    dns_ip: values.dns_ip,
    server: values.server,
    domain: values.domain,
    ...(values.ou ? { ou: values.ou } : {}),
    ...(values.user ? { user: values.user } : {}),
    ...(values.password ? { password: values.password } : {}),
    ...(values.description ? { description: values.description } : {}),
  };
}

/**
 * The edit request: the name, every field that changed (an emptied one as
 * "", which clears it) and the password only when one was typed, since
 * the service never sends the stored one back.
 */
export function updateSecurityServiceBody(
  service: SecurityService,
  values: SecurityServiceValues,
): SecurityServiceUpdate {
  const changed = OPTIONAL_FIELDS.filter(
    (field) => values[field] !== (service[field] ?? ""),
  );
  return {
    name: values.name,
    ...Object.fromEntries(changed.map((field) => [field, values[field]])),
    ...(values.password ? { password: values.password } : {}),
  };
}
