// Add a static route to a router (Horizon's extraroutes/forms.py).
import { z } from "zod";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { fieldsFor } from "../../../../components/Form/fields";
import type { Router } from "../../../../lib/api/types/network";
import { useSetRoutes } from "../../api";
import { ipVersion, parseCidr } from "../../../../lib/net";
import { withRoute } from "../staticRoutes";

const routeSchema = z
  .object({
    destination: z.string().trim().min(1, "Enter the destination CIDR"),
    nexthop: z.string().trim().min(1, "Enter the next hop address"),
  })
  .superRefine((values, ctx) => {
    const destination = parseCidr(values.destination);
    if (!destination) {
      ctx.addIssue({
        code: "custom",
        path: ["destination"],
        message: "Enter an address range such as 10.1.0.0/16",
      });
    }
    const nexthop = ipVersion(values.nexthop);
    if (!nexthop) {
      ctx.addIssue({
        code: "custom",
        path: ["nexthop"],
        message: "Enter an IP address",
      });
    } else if (destination && destination.version !== nexthop) {
      ctx.addIssue({
        code: "custom",
        path: ["nexthop"],
        message: "The destination and next hop must be the same IP version",
      });
    }
  });

/**
 * The add static route dialog: a destination and a next hop of the same
 * IP version, sent with the router's other routes.
 */
export function AddRouteDialog({
  router,
  onClose,
}: {
  router: Router;
  onClose: () => void;
}) {
  const { TextInput } = fieldsFor<z.infer<typeof routeSchema>>();
  const { dialog } = useMutationForm({
    schema: routeSchema,
    defaultValues: { destination: "", nexthop: "" },
    mutation: useSetRoutes(),
    toVariables: (values) => ({
      routerId: router.id,
      routes: withRoute(router.routes, {
        destination: values.destination,
        nexthop: values.nexthop,
      }),
    }),
    successMessage: "Static route added.",
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Add static route to ${router.name}`}
      submitLabel="Add route"
    >
      <TextInput name="destination" label="Destination CIDR" isRequired />
      <TextInput
        name="nexthop"
        label="Next hop"
        isRequired
        description="An address reachable from one of the router's interfaces."
      />
    </FormDialog>
  );
}
