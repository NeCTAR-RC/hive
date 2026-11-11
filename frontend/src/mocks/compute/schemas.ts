// The request bodies the mocked compute endpoints accept, checked the way
// the backend checks them. Each schema is tied to the frontend's request
// type where one exists, so the two cannot drift apart unnoticed.
import { z } from "zod";
import type {
  ImageCreateRequest,
  ImageUpdateRequest,
  InstanceActionRequest,
  LaunchRequest,
  ServerGroupPolicy,
} from "../../lib/api/types/compute";
import type { RuleCreate } from "../../lib/api/types/network";

const name = z.string().min(1);
const visibility = z.enum(["private", "shared", "public", "community"]);

export const launchBody = z.object({
  name,
  count: z.number().int().min(1),
  source: z.object({
    type: z.enum(["image", "snapshot", "volume", "volume_snapshot"]),
    id: z.string().min(1),
  }),
  flavor_id: z.string().min(1),
  // Left out (or null) for any zone, as the backend accepts it.
  availability_zone: z.string().min(1).nullable().optional(),
  create_volume: z.boolean().optional(),
  volume_size_gb: z.number().int().min(1).nullable().optional(),
  // Left out (or null) for Cinder's default type.
  volume_type: z.string().min(1).nullable().optional(),
  config_drive: z.boolean().optional(),
  networks: z.array(z.string()),
  ports: z.array(z.string()),
  security_groups: z.array(z.string()),
  key_name: z.string().nullable(),
  user_data: z.string().nullable(),
  metadata: z.record(z.string(), z.string()),
  description: z.string().nullable(),
  server_group_id: z.string().nullable(),
  delete_volume_on_termination: z.boolean(),
}) satisfies z.ZodType<LaunchRequest>;

export const instanceUpdateBody = z.object({
  name: name.optional(),
  description: z.string().optional(),
});

const id = z.string().min(1);

/** An action that carries nothing but its name. */
function bare<Action extends string>(action: Action) {
  return z.strictObject({ action: z.literal(action) });
}

/**
 * The body of `POST /api/compute/instances/:id/actions`: one strict object
 * per action, told apart by `action`, as the backend's discriminated union
 * (`backend/hive/schemas/instance_actions.py`) checks it. A stray or
 * missing field fails, and attach-interface names exactly one of its
 * network or port.
 */
export const instanceActionBody = z.discriminatedUnion("action", [
  bare("start"),
  bare("stop"),
  bare("pause"),
  bare("unpause"),
  bare("suspend"),
  bare("resume"),
  bare("shelve"),
  bare("unshelve"),
  bare("lock"),
  bare("unlock"),
  bare("confirm-resize"),
  bare("revert-resize"),
  bare("unrescue"),
  z.strictObject({
    action: z.literal("reboot"),
    type: z.enum(["SOFT", "HARD"]).optional(),
  }),
  z.strictObject({ action: z.literal("resize"), flavor_id: id }),
  z.strictObject({
    action: z.literal("rebuild"),
    image_id: id,
    name: z.string().nullable().optional(),
    password: z.string().nullable().optional(),
  }),
  z.strictObject({
    action: z.literal("rescue"),
    rescue_image_id: z.string().nullable().optional(),
  }),
  z.strictObject({ action: z.literal("snapshot"), name }),
  z.strictObject({
    action: z.literal("add-security-group"),
    security_group: name,
  }),
  z.strictObject({
    action: z.literal("remove-security-group"),
    security_group: name,
  }),
  z.strictObject({ action: z.literal("attach-volume"), volume_id: id }),
  z.strictObject({ action: z.literal("detach-volume"), volume_id: id }),
  z
    .strictObject({
      action: z.literal("attach-interface"),
      network_id: z.string().nullable().optional(),
      port_id: z.string().nullable().optional(),
    })
    .refine((body) => Boolean(body.network_id) !== Boolean(body.port_id), {
      message: "give exactly one of network_id or port_id",
    }),
  z.strictObject({ action: z.literal("detach-interface"), port_id: id }),
  z.strictObject({
    action: z.literal("associate-fip"),
    floating_ip_id: id,
    port_id: z.string().nullable().optional(),
  }),
  z.strictObject({ action: z.literal("disassociate-fip"), floating_ip_id: id }),
  z.strictObject({
    action: z.literal("update-metadata"),
    metadata: z.record(z.string(), z.string()),
  }),
]) satisfies z.ZodType<InstanceActionRequest>;

export const imageCreateBody = z.object({
  name,
  source_url: z.string().optional(),
  disk_format: z.string().min(1),
  container_format: z.string().min(1),
  visibility: visibility.optional(),
  min_disk: z.number().int().min(0),
  min_ram: z.number().int().min(0),
  protected: z.boolean(),
  properties: z.record(z.string(), z.string()),
}) satisfies z.ZodType<ImageCreateRequest>;

export const imageUpdateBody = z.object({
  name: name.optional(),
  visibility: visibility.optional(),
  min_disk: z.number().int().min(0).optional(),
  min_ram: z.number().int().min(0).optional(),
  protected: z.boolean().optional(),
  properties: z.record(z.string(), z.string().nullable()).optional(),
}) satisfies z.ZodType<ImageUpdateRequest>;

export const keyPairCreateBody = z.object({
  name,
  public_key: z.string().optional(),
  type: z.enum(["ssh", "x509"]).optional(),
});

export const serverGroupCreateBody = z.object({
  name,
  policy: z.enum([
    "affinity",
    "anti-affinity",
    "soft-affinity",
    "soft-anti-affinity",
  ]),
}) satisfies z.ZodType<{ name: string; policy: ServerGroupPolicy }>;

export const securityGroupCreateBody = z.object({
  name,
  description: z.string(),
});

export const securityGroupUpdateBody = z.object({
  name: name.optional(),
  description: z.string().optional(),
});

export const ruleCreateBody = z.object({
  direction: z.enum(["ingress", "egress"]),
  ethertype: z.enum(["IPv4", "IPv6"]),
  preset: z.string().nullable().optional(),
  protocol: z.string().nullable().optional(),
  port_range_min: z.number().int().nullable().optional(),
  port_range_max: z.number().int().nullable().optional(),
  remote_ip_prefix: z.string().nullable().optional(),
  remote_group_id: z.string().nullable().optional(),
  description: z.string().optional(),
}) satisfies z.ZodType<RuleCreate>;
