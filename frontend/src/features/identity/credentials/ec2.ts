// Pure rules of the credentials page: the user's EC2 keys in other projects.
import type { Credential } from "../../../lib/api/types/identity";

/**
 * The access key in an EC2 credential's data, which Keystone keeps as a
 * JSON object (`{"access": "...", "secret": "..."}`); undefined when the
 * data is not that shape.
 */
export function ec2AccessKey(blob: string): string | undefined {
  try {
    const data: unknown = JSON.parse(blob);
    if (typeof data !== "object" || data === null) return undefined;
    const access = (data as { access?: unknown }).access;
    return typeof access === "string" && access ? access : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The user's EC2 keys held in projects other than `projectId`; the current
 * project's key is the EC2 panel's, and other credential types are not
 * part of signing in through AAF.
 */
export function otherProjectKeys(
  credentials: Credential[],
  projectId: string,
): Credential[] {
  return credentials.filter(
    (credential) =>
      credential.type === "ec2" && credential.project_id !== projectId,
  );
}
