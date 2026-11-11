// The security service form's schemas, shared by the create and edit
// dialogs (manila-ui security_services/forms.py).
import { z } from "zod";
import { maxLength } from "../../../../lib/validation";

/** Every field of the form; the passwords must match. */
export const securityServiceSchema = z
  .object({
    name: maxLength(255).min(1, "Enter a name"),
    type: z.string().min(1, "Choose a type"),
    dns_ip: maxLength(255),
    server: maxLength(255),
    domain: maxLength(255),
    ou: maxLength(255),
    user: maxLength(255),
    password: maxLength(255, { trim: false }),
    confirm_password: maxLength(255, { trim: false }),
    description: maxLength(255),
  })
  .superRefine((values, ctx) => {
    if (values.password !== values.confirm_password) {
      ctx.addIssue({
        code: "custom",
        path: ["confirm_password"],
        message: "The passwords do not match",
      });
    }
  });

/** Create also requires the DNS IP, server and domain. */
export const createSecurityServiceSchema = securityServiceSchema.superRefine(
  (values, ctx) => {
    for (const field of ["dns_ip", "server", "domain"] as const) {
      if (!values[field]) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "This field is required",
        });
      }
    }
  },
);
