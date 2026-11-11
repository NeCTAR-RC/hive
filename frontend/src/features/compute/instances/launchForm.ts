// The launch wizard's form: its values and field rules, the extra rules the
// loaded options add, and the launch request the values become.
import { z } from "zod";
import {
  keyValueRecord,
  keyValueSchema,
} from "../../../components/Form/keyValue";
import type {
  LaunchOptions,
  LaunchRequest,
} from "../../../lib/api/types/compute";
import { maxLength } from "../../../lib/validation";
import {
  flavorQuotaProblem,
  instanceQuotaProblem,
  isSourceOffered,
  userDataTooLarge,
  volumeSizeFloor,
  volumeTypesForZone,
} from "./launch";
import { isReservationFlavor, launchZone } from "./launchFlavors";

/** The select value for "No key pair" and "No server group". */
export const NONE = "__none__";

/**
 * The zone choice that leaves the zone to Nova's scheduler, Horizon's "Any
 * Availability Zone" (launch-instance-model.service.js).
 */
export const ANY_ZONE = "__any__";

/** How the picker and the summary name `ANY_ZONE`, as Horizon does. */
export const ANY_ZONE_LABEL = "Any availability zone";

/** The volume type choice that leaves the type to Cinder's default. */
export const DEFAULT_VOLUME_TYPE = "__default__";

/** The zone the form names, or "" for any zone. */
export function chosenZone(value: string): string {
  return value === ANY_ZONE ? "" : value;
}

/** The field rules of every launch, whatever the options offer. */
export const launchFormSchema = z
  .object({
    name: maxLength(255).min(1, "Enter an instance name"),
    description: maxLength(255),
    // ANY_ZONE leaves the choice to Nova.
    availability_zone: z.string().min(1, "Choose an availability zone"),
    count: z
      .number({ message: "Enter how many instances to launch" })
      .int()
      .min(1, "At least 1")
      .max(100, "At most 100"),
    source_type: z.enum(["image", "snapshot", "volume", "volume_snapshot"]),
    source_id: z.string().min(1, "Choose a source"),
    create_volume: z.boolean(),
    volume_size_gb: z.number().int().optional(),
    // DEFAULT_VOLUME_TYPE leaves the type to Cinder.
    volume_type: z.string(),
    delete_volume_on_termination: z.boolean(),
    // Not sent: the flavour class card the user opened, kept in the form so
    // it survives the flavour step unmounting.
    flavor_class: z.string(),
    flavor_id: z.string().min(1, "Choose a flavour"),
    networks: z.array(z.string()),
    ports: z.array(z.string()),
    security_groups: z.array(z.string()),
    key_name: z.string(),
    user_data: z.string().refine((script) => !userDataTooLarge(script), {
      message: "Scripts are limited to 48 KB",
    }),
    server_group_id: z.string(),
    config_drive: z.boolean(),
    metadata: keyValueSchema,
  })
  .refine((v) => v.networks.length + v.ports.length > 0, {
    message: "Choose at least one network or port",
    path: ["networks"],
  })
  // Nova gives a port to one instance only, so several instances cannot
  // share an existing port (Nova refuses the launch).
  .refine((v) => v.ports.length === 0 || v.count <= 1, {
    message:
      "An existing port can serve one instance only. Launch one instance, or choose networks instead.",
    path: ["ports"],
  });

export type LaunchForm = z.infer<typeof launchFormSchema>;

/** Whether the source type is copied to a new volume when asked. */
export function canCreateVolume(type: LaunchForm["source_type"]): boolean {
  return type === "image" || type === "snapshot";
}

/** The chosen image or instance snapshot, if one is chosen. */
export function chosenImage(
  options: Pick<LaunchOptions, "images" | "snapshots"> | undefined,
  values: Pick<LaunchForm, "source_type" | "source_id">,
) {
  if (!canCreateVolume(values.source_type)) return undefined;
  return [...(options?.images ?? []), ...(options?.snapshots ?? [])].find(
    (image) => image.id === values.source_id,
  );
}

/**
 * The zone the launch runs in, as far as the wizard knows: the chosen zone,
 * or "" for any zone and for a reservation flavour, whose reservation
 * decides (`launchZone`). Sources, volume types and the new volume follow
 * it.
 */
export function effectiveZone(
  options: Pick<LaunchOptions, "flavors"> | undefined,
  values: Pick<LaunchForm, "availability_zone" | "flavor_id">,
): string {
  return launchZone(
    options?.flavors,
    values.flavor_id,
    chosenZone(values.availability_zone),
  );
}

/**
 * The volume type to keep in a zone: the chosen one while the zone offers
 * it, else the default, so a type never outlives the zone that serves it.
 */
export function offeredVolumeType(
  options: Pick<LaunchOptions, "volume_types" | "has_zoned_types">,
  zone: string,
  current: string,
): string {
  if (current === DEFAULT_VOLUME_TYPE) return current;
  const offered = volumeTypesForZone(options, zone).some(
    (t) => t.name === current,
  );
  return offered ? current : DEFAULT_VOLUME_TYPE;
}

/**
 * The smallest new boot volume for the chosen image and flavour
 * (`volumeSizeFloor`).
 */
export function chosenVolumeFloor(
  options: Pick<LaunchOptions, "images" | "snapshots" | "flavors"> | undefined,
  values: Pick<LaunchForm, "source_type" | "source_id" | "flavor_id">,
): number {
  return volumeSizeFloor(
    chosenImage(options, values),
    options?.flavors?.find((f) => f.id === values.flavor_id),
  );
}

/**
 * The new volume's size raised to the floor, or undefined when the size
 * already holds it: a new volume starts at the floor and grows with it,
 * and a larger size the user typed is kept.
 */
export function volumeSizeAtFloor(
  size: number | undefined,
  floor: number,
): number | undefined {
  return size === undefined || size < floor ? floor : undefined;
}

/**
 * Why the new boot volume cannot be made, or null when it can. The fork
 * offers a new volume only once a zone is chosen (Horizon commit 216995ea1,
 * as backend/hive/nectar/volumes.py checks it); a reservation flavour sends
 * no zone, so it cannot have one either.
 */
function newVolumeZoneProblem(
  options: LaunchOptions | undefined,
  values: LaunchForm,
): string | null {
  if (effectiveZone(options, values)) return null;
  return isReservationFlavor(options?.flavors, values.flavor_id)
    ? "A reservation flavour sets the availability zone, so it cannot boot from a new volume. Turn this off, or choose another flavour."
    : "Choose an availability zone on the Details step to boot from a new volume";
}

/**
 * The launch schema for the loaded options: on top of the field rules, the
 * chosen source must be one the options offer for the chosen type and
 * zone, a new boot volume needs a zone, must hold the image and the
 * flavour's root disk and take a type the zone offers, and the count and
 * flavour must fit the project's instance, vCPU and RAM quota, so Next and
 * Launch stop at the field instead of Nova refusing the launch at the end.
 */
export function launchSchema(options: LaunchOptions | undefined) {
  return launchFormSchema.superRefine((values, ctx) => {
    const zone = effectiveZone(options, values);
    if (values.create_volume && canCreateVolume(values.source_type)) {
      const problem = newVolumeZoneProblem(options, values);
      if (problem) {
        ctx.addIssue({
          code: "custom",
          path: ["create_volume"],
          message: problem,
        });
      }
      const floor = chosenVolumeFloor(options, values);
      if (values.volume_size_gb === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["volume_size_gb"],
          message: "Enter the volume size",
        });
      } else if (values.volume_size_gb < floor) {
        ctx.addIssue({
          code: "custom",
          path: ["volume_size_gb"],
          message: `At least ${floor} GB`,
        });
      }
      // With no zone to judge the type by, the zone problem is the one
      // error to show.
      if (
        options &&
        !problem &&
        offeredVolumeType(options, zone, values.volume_type) !==
          values.volume_type
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["volume_type"],
          message: "Choose one of the listed volume types",
        });
      }
    }
    const instances = instanceQuotaProblem(options?.limits, values.count);
    if (instances) {
      ctx.addIssue({ code: "custom", path: ["count"], message: instances });
    }
    const flavor = options?.flavors?.find((f) => f.id === values.flavor_id);
    const resources =
      flavor && flavorQuotaProblem(options?.limits, flavor, values.count);
    if (resources) {
      ctx.addIssue({ code: "custom", path: ["flavor_id"], message: resources });
    }
    if (
      options &&
      values.source_id &&
      !isSourceOffered(options, values.source_type, zone, values.source_id)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["source_id"],
        message: "Choose one of the listed sources",
      });
    }
  });
}

/**
 * The new boot volume as the summary names it ("New 40 GB volume
 * (qh2-ssd), deleted with the instance"), or "" when there is none. The
 * values are the summary's partial watch, so any field may be missing.
 */
export function newVolumeSummary(
  values: Partial<
    Pick<
      LaunchForm,
      | "create_volume"
      | "source_type"
      | "volume_size_gb"
      | "volume_type"
      | "delete_volume_on_termination"
    >
  >,
): string {
  if (!values.create_volume || !values.source_type) return "";
  if (!canCreateVolume(values.source_type)) return "";
  const type =
    values.volume_type && values.volume_type !== DEFAULT_VOLUME_TYPE
      ? ` (${values.volume_type})`
      : "";
  const deleted = values.delete_volume_on_termination
    ? ", deleted with the instance"
    : "";
  return `New ${values.volume_size_gb ?? "?"} GB volume${type}${deleted}`;
}

/**
 * The launch request for validated form values. An empty or "none" choice
 * is sent as null ("Any availability zone", a reservation flavour's zone
 * and the default volume type too), and the metadata rows as an object. A
 * new boot volume is sent only for an image or instance snapshot.
 */
export function launchRequest(
  values: LaunchForm,
  options: Pick<LaunchOptions, "flavors"> | undefined,
): LaunchRequest {
  const newVolume =
    values.create_volume &&
    canCreateVolume(values.source_type) &&
    values.volume_size_gb !== undefined;
  const bootsFromVolume = newVolume || !canCreateVolume(values.source_type);
  return {
    name: values.name,
    count: values.count,
    source: { type: values.source_type, id: values.source_id },
    flavor_id: values.flavor_id,
    availability_zone: effectiveZone(options, values) || null,
    networks: values.networks,
    ports: values.ports,
    security_groups: values.security_groups,
    key_name:
      values.key_name && values.key_name !== NONE ? values.key_name : null,
    user_data: values.user_data || null,
    metadata: keyValueRecord(values.metadata),
    description: values.description || null,
    server_group_id:
      values.server_group_id && values.server_group_id !== NONE
        ? values.server_group_id
        : null,
    // Only a volume the instance boots from can go with it.
    delete_volume_on_termination:
      bootsFromVolume && values.delete_volume_on_termination,
    config_drive: values.config_drive,
    ...(newVolume
      ? {
          create_volume: true,
          volume_size_gb: values.volume_size_gb,
          volume_type:
            values.volume_type === DEFAULT_VOLUME_TYPE
              ? null
              : values.volume_type,
        }
      : {}),
  };
}
