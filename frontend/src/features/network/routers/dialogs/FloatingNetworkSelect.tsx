// The external network picker the create router and set gateway dialogs
// share.
import { fieldsFor } from "../../../../components/Form/fields";

/**
 * The external network picker of the create and set gateway dialogs. It
 * binds the `external_network_id` field of the form it renders in, so only
 * that field's type matters here.
 */
export function FloatingNetworkSelect({
  options,
  isRequired,
  description,
}: {
  options: { id: string; name: string }[] | undefined;
  isRequired?: boolean;
  description?: string;
}) {
  const { SelectInput } = fieldsFor<{ external_network_id: string }>();
  const choices = (options ?? []).map((n) => ({ id: n.id, label: n.name }));
  return (
    <SelectInput
      name="external_network_id"
      label="External network"
      options={
        isRequired ? choices : [{ id: "", label: "No gateway" }, ...choices]
      }
      isRequired={isRequired ?? false}
      isDisabled={options === undefined}
      placeholder={
        options === undefined
          ? "Loading networks..."
          : choices.length === 0
            ? "No external networks are available"
            : "Choose a network"
      }
      description={
        description ??
        "Only networks Nectar marks as floating can be a gateway; it gives the router's subnets a route out and lets floating IPs reach them."
      }
    />
  );
}
