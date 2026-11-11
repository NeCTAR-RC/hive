// The form schemas of the Trunks panel's dialogs: the subport rows the
// create and add subports dialogs share, and the create and edit forms.
import { z } from "zod";
import { NAME } from "../../schema";

const VLAN_MESSAGE = "Enter a VLAN id from 1 to 4094";

/**
 * One subport row: a port, its segmentation type and VLAN id. The id is
 * empty (null, or undefined once the number field is cleared) until typed;
 * `refineSubports` asks for it on a VLAN subport.
 */
export const subportSchema = z.object({
  port_id: z.string().min(1, "Choose a port"),
  segmentation_type: z.enum(["vlan", "inherit"]),
  segmentation_id: z
    .number(VLAN_MESSAGE)
    .int(VLAN_MESSAGE)
    .min(1, VLAN_MESSAGE)
    .max(4094, VLAN_MESSAGE)
    .nullish(),
});

export type SubportValues = z.infer<typeof subportSchema>;

/** The part of a trunk form the subport rows edit. */
export interface SubportsForm {
  sub_ports: SubportValues[];
}

/**
 * The subport rules both dialogs share: a VLAN subport needs its id, and
 * a subport cannot be the trunk's parent port (`parentPortId`, when the
 * form chooses one).
 */
export function refineSubports(
  subports: SubportValues[],
  ctx: z.RefinementCtx,
  parentPortId?: string,
) {
  subports.forEach((subport, index) => {
    if (
      subport.segmentation_type === "vlan" &&
      typeof subport.segmentation_id !== "number"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["sub_ports", index, "segmentation_id"],
        message: VLAN_MESSAGE,
      });
    }
    if (parentPortId !== undefined && subport.port_id === parentPortId) {
      ctx.addIssue({
        code: "custom",
        path: ["sub_ports", index, "port_id"],
        message: "The parent port cannot also be a subport",
      });
    }
  });
}

/**
 * The create trunk form: details, a parent port, and subports that each
 * need a VLAN id (unless inherited) and cannot be the parent.
 */
export const createTrunkSchema = z
  .object({
    name: NAME,
    description: NAME,
    admin_state_up: z.boolean(),
    port_id: z.string().min(1, "Choose the parent port"),
    sub_ports: z.array(subportSchema),
  })
  .superRefine((values, ctx) =>
    refineSubports(values.sub_ports, ctx, values.port_id),
  );

export type CreateTrunkValues = z.infer<typeof createTrunkSchema>;

/** The add subports form: at least one subport row. */
export const addSubportsSchema = z
  .object({
    sub_ports: z.array(subportSchema).min(1, "Add at least one subport"),
  })
  .superRefine((values, ctx) => refineSubports(values.sub_ports, ctx));

/** The edit trunk form: name, description and admin state. */
export const editTrunkSchema = z.object({
  name: NAME,
  description: NAME,
  admin_state_up: z.boolean(),
});

export type EditTrunkValues = z.infer<typeof editTrunkSchema>;
