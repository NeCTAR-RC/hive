// A folder inside a container (Horizon project/containers objects view at
// a deeper path).
import { getRouteApi } from "@tanstack/react-router";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { ContainerView } from "./ContainerView";

const folderRoute = getRouteApi("/app/object-store/containers/$container/$");

/** A folder inside a container; the splat is the folder's path. */
export function ContainerFolderPage() {
  const { container, _splat } = folderRoute.useParams();
  const search = useListSearch(folderRoute);
  const path = (_splat ?? "").replace(/^\/+|\/+$/g, "");
  return <ContainerView container={container} path={path} search={search} />;
}
