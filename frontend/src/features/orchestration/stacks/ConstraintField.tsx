// A template parameter whose Heat custom constraint names the project's own
// resources, as a choice of them (see `constraints.ts`).
import { useState } from "react";
import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useFormContext } from "react-hook-form";
import { fieldsFor } from "../../../components/Form/fields";
import type { Items } from "../../../lib/api/types/common";
import type { Flavor, Image, KeyPair } from "../../../lib/api/types/compute";
import type { Network } from "../../../lib/api/types/network";
import type { Volume } from "../../../lib/api/types/volumes";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { flavorsQuery, imagesQuery, keyPairsQuery } from "../../compute/api";
import { networksQuery } from "../../network/api";
import { volumesQuery } from "../../volumes/api";
import {
  constraintOptions,
  type Choice,
  type SourcedConstraint,
} from "./constraints";

/** The part of a form the parameter fields edit (see `ParameterFields`). */
type ParameterValues = { parameters: Record<string, string> };

const { SelectInput, TextInput } = fieldsFor<ParameterValues>();

/** The field props every parameter binding takes. */
export interface ParameterFieldProps {
  name: `parameters.${string}`;
  label: string;
  isRequired: boolean;
  description?: string;
}

const named = (item: { id: string; name: string | null }): Choice => ({
  id: item.id,
  name: item.name ?? "",
  label: item.name || item.id,
});

const keyPairChoices = (data: Items<KeyPair>): Choice[] =>
  data.items.map((k) => ({ id: k.name, name: k.name, label: k.name }));

const flavorChoices = (data: Items<Flavor>): Choice[] => data.items.map(named);

const imageChoices = (data: Items<Image>): Choice[] => data.items.map(named);

const networkChoices = (data: Items<Network>): Choice[] =>
  data.items.map(named);

const subnetChoices = (data: Items<Network>): Choice[] =>
  data.items.flatMap((network) =>
    network.subnets.map((subnet) => ({
      id: subnet.id,
      name: subnet.name ?? "",
      label: `${subnet.name || subnet.id} (${subnet.cidr})`,
    })),
  );

const volumeChoices = (data: Items<Volume>): Choice[] =>
  data.items.map((volume) => ({
    ...named(volume),
    label: `${volume.name || volume.id} (${volume.size_gb} GB)`,
  }));

/**
 * The choice for a parameter of a sourced `constraint`, read from the
 * feature that lists those resources.
 */
export function ConstraintField({
  constraint,
  field,
}: {
  constraint: SourcedConstraint;
  field: ParameterFieldProps;
}) {
  const projectId = useProjectId();
  const common = { field };
  switch (constraint) {
    case "nova.keypair":
      return (
        <SourcedSelect
          {...common}
          query={keyPairsQuery(projectId)}
          toChoices={keyPairChoices}
        />
      );
    case "nova.flavor":
      return (
        <SourcedSelect
          {...common}
          query={flavorsQuery(projectId)}
          toChoices={flavorChoices}
        />
      );
    case "glance.image":
      return (
        <SourcedSelect
          {...common}
          query={imagesQuery(projectId, {})}
          toChoices={imageChoices}
        />
      );
    case "neutron.network":
      return (
        <SourcedSelect
          {...common}
          query={networksQuery(projectId, "any")}
          toChoices={networkChoices}
        />
      );
    case "neutron.subnet":
      return (
        <SourcedSelect
          {...common}
          query={networksQuery(projectId, "any")}
          toChoices={subnetChoices}
        />
      );
    case "cinder.volume":
      return (
        <SourcedSelect
          {...common}
          query={volumesQuery(projectId)}
          toChoices={volumeChoices}
        />
      );
  }
}

/**
 * A select of what `query` lists. The value the form started with (the
 * template's default on launch, the stack's value on a change) stays
 * selectable even when the project does not list it. While the list loads
 * the select says so; if it cannot be read, the parameter falls back to a
 * text box, so a failed list never blocks the launch.
 */
function SourcedSelect<T>({
  query,
  toChoices,
  field,
}: {
  query: UseQueryOptions<T, Error, T, QueryKey>;
  toChoices: (data: T) => Choice[];
  field: ParameterFieldProps;
}) {
  const { getValues } = useFormContext<ParameterValues>();
  const [initial] = useState(() => getValues(field.name));
  const result = useQuery(query);
  if (result.isError) return <TextInput {...field} />;
  return (
    <SelectInput
      {...field}
      options={constraintOptions(
        result.data ? toChoices(result.data) : [],
        initial,
      )}
      {...(result.isPending ? { placeholder: "Loading..." } : {})}
    />
  );
}
