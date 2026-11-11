// The form schemas of the Routers panel's dialogs whose values become a
// request body: create, edit and add interface.
import { z } from "zod";
import { NAME } from "../../schema";
import { isIpAddress } from "../../../../lib/net";

/** The create router form; a blank external network means no gateway. */
export const createRouterSchema = z.object({
  name: NAME,
  admin_state_up: z.boolean(),
  external_network_id: z.string(),
  availability_zone_hints: z.array(z.string()),
});

export type CreateRouterValues = z.infer<typeof createRouterSchema>;

/** The edit router form: its name and admin state. */
export const editRouterSchema = z.object({
  name: NAME,
  admin_state_up: z.boolean(),
});

export type EditRouterValues = z.infer<typeof editRouterSchema>;

/** The add interface form: a subnet and, optionally, the address to take. */
export const interfaceSchema = z
  .object({
    subnet_id: z.string().min(1, "Choose a subnet"),
    ip_address: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (values.ip_address && !isIpAddress(values.ip_address)) {
      ctx.addIssue({
        code: "custom",
        path: ["ip_address"],
        message: "Enter an IP address",
      });
    }
  });

export type InterfaceValues = z.infer<typeof interfaceSchema>;
