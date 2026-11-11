// The request bodies the mocked share endpoints accept, each tied to the
// frontend's request type so the two cannot drift apart unnoticed.
import { z } from "zod";
import type {
  SecurityServiceRequest,
  SecurityServiceUpdate,
  ShareCreateRequest,
} from "../../lib/api/types/shares";

const name = z.string().min(1);
const rename = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
});

export const shareCreateBody = z.object({
  name,
  description: z.string().optional(),
  protocol: z.string().min(1),
  size: z.number().int().min(1),
  share_type: z.string().min(1),
  availability_zone: z.string().optional(),
  snapshot_id: z.string().optional(),
  share_group_id: z.string().optional(),
  metadata: z.string().optional(),
  is_public: z.boolean().optional(),
}) satisfies z.ZodType<ShareCreateRequest>;

export const shareUpdateBody = rename.extend({
  is_public: z.boolean().optional(),
});

export const shareMetadataBody = z.object({ metadata: z.string() });

export const shareResizeBody = z.object({ size: z.number().int().min(1) });

export const shareRevertBody = z.object({ snapshot_id: z.string().min(1) });

export const accessRuleBody = z.object({
  access_type: z.string().min(1),
  access_to: z.string().min(1),
  access_level: z.string().min(1),
});

/** A snapshot access rule, as the backend's `SnapshotAccessCreate`. */
export const snapshotAccessBody = z.object({
  access_type: z.enum(["ip", "user", "cert", "cephx"]),
  access_to: z.string().min(1),
});

export const snapshotCreateBody = z.object({
  share_id: z.string().min(1),
  name,
  description: z.string().optional(),
});

export const snapshotUpdateBody = rename;

export const securityServiceBody = z.object({
  name,
  type: z.enum(["active_directory", "ldap", "kerberos"]),
  dns_ip: z.string().min(1),
  server: z.string().min(1),
  domain: z.string().min(1),
  ou: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  description: z.string().optional(),
}) satisfies z.ZodType<SecurityServiceRequest>;

/** An update cannot change the type; "" or null clears a field. */
export const securityServiceUpdateBody = z.object({
  name: name.optional(),
  dns_ip: z.string().nullable().optional(),
  server: z.string().nullable().optional(),
  domain: z.string().nullable().optional(),
  ou: z.string().nullable().optional(),
  user: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
}) satisfies z.ZodType<SecurityServiceUpdate>;

export const shareGroupCreateBody = z.object({
  name,
  description: z.string().optional(),
  share_group_type_id: z.string().optional(),
  share_types: z.array(z.string()).optional(),
  availability_zone: z.string().optional(),
  snapshot_id: z.string().optional(),
});

export const shareGroupUpdateBody = rename;

export const groupSnapshotCreateBody = z.object({
  share_group_id: z.string().min(1),
  name,
  description: z.string().optional(),
});

export const groupSnapshotUpdateBody = rename;
