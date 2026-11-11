// A container's top level (Horizon project/containers objects view).
import { getRouteApi } from "@tanstack/react-router";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { ContainerView } from "./ContainerView";

const containerRoute = getRouteApi("/app/object-store/containers/$container");

/** A container's top level. */
export function ContainerPage() {
  const { container } = containerRoute.useParams();
  const search = useListSearch(containerRoute);
  return <ContainerView container={container} path="" search={search} />;
}
