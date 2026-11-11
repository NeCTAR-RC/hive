// The request bodies the mocked DNS endpoints accept, each tied to the
// frontend's request type so the two cannot drift apart unnoticed.
import { z } from "zod";
import type {
  RecordSetCreateRequest,
  ZoneCreateRequest,
} from "../../lib/api/types/dns";

const ttl = z.number().int().min(1);

export const zoneCreateBody = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  ttl: ttl.optional(),
  description: z.string().optional(),
  type: z.enum(["PRIMARY", "SECONDARY"]).optional(),
  masters: z.array(z.string()).optional(),
}) satisfies z.ZodType<ZoneCreateRequest>;

export const zoneUpdateBody = z.object({
  email: z.string().min(1).optional(),
  ttl: ttl.optional(),
  description: z.string().optional(),
});

export const recordSetCreateBody = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  records: z.array(z.string().min(1)).min(1),
  ttl: ttl.optional(),
  description: z.string().optional(),
}) satisfies z.ZodType<RecordSetCreateRequest>;

/** A null TTL restores the zone's default; an omitted one keeps the current. */
export const recordSetUpdateBody = z.object({
  records: z.array(z.string().min(1)).min(1),
  ttl: ttl.nullable().optional(),
  description: z.string().optional(),
});
