// The request bodies the mocked database endpoints accept, each tied to the
// frontend's request type where one exists, so they cannot drift apart.
import { z } from "zod";
import type {
  DbLaunchRequest,
  DbLogActionRequest,
} from "../../lib/api/types/databases";

const name = z.string().min(1);

export const instanceLaunchBody = z.object({
  name,
  flavor: z.string().min(1),
  volume: z.number().int().min(1),
  datastore: z.string().min(1),
  version: z.string().min(1),
  network_id: z.string().min(1),
  availability_zone: z.string().optional(),
  allowed_cidrs: z.array(z.string()),
  databases: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  host: z.string().optional(),
  configuration: z.string().optional(),
  backup_id: z.string().optional(),
}) satisfies z.ZodType<DbLaunchRequest>;

export const instanceUpdateBody = z.object({
  name: name.optional(),
  allowed_cidrs: z.array(z.string()).optional(),
});

export const resizeVolumeBody = z.object({ size: z.number().int().min(1) });

export const resizeInstanceBody = z.object({ flavor: z.string().min(1) });

export const upgradeBody = z.object({ version_id: z.string().min(1) });

export const attachConfigurationBody = z.object({
  configuration_id: z.string().min(1),
});

export const userCreateBody = z.object({
  name,
  password: z.string().min(8),
  host: z.string().optional(),
  databases: z.array(z.string()).optional(),
});

/** A user's edit: at least one new attribute. */
export const userUpdateBody = z
  .object({
    name: z.string().min(1).optional(),
    password: z.string().min(8).optional(),
    host: z.string().min(1).optional(),
  })
  .refine((body) => Object.keys(body).length > 0);

export const userAccessBody = z.object({ databases: z.array(z.string()) });

export const databaseCreateBody = z.object({
  name,
  character_set: z.string().optional(),
  collate: z.string().optional(),
});

export const backupCreateBody = z.object({
  name,
  instance_id: z.string().min(1),
  description: z.string().optional(),
  parent_id: z.string().optional(),
});

export const configurationCreateBody = z.object({
  name,
  description: z.string().optional(),
  datastore: z.string().min(1),
  version: z.string().min(1),
});

export const configurationValuesBody = z.object({
  values: z.record(z.string(), z.string()),
});

/** A log action: its name alone, as the backend's `DatabaseLogAction`. */
export const logActionBody = z.strictObject({
  action: z.enum(["enable", "disable", "publish", "discard"]),
}) satisfies z.ZodType<DbLogActionRequest>;
