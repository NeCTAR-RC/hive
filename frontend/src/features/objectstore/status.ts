// The row action rules of the Object Store panels (Horizon
// project/containers): what a container, a folder and an object offer.
import { offerActions, type ActionTable } from "../../lib/actions";
import type { Container, StoreObject } from "../../lib/api/types/objectstore";
import { formatNumber } from "../../lib/format";

export type ContainerActionId = "open" | "delete";

/** "its 3 objects", "its 1 object": what a container holds. */
export function containerContents(container: Container): string {
  const count = container.object_count;
  return `its ${formatNumber(count)} ${count === 1 ? "object" : "objects"}`;
}

/**
 * A container opens, or goes; one with objects goes with them, and its
 * menu says how many (Horizon refuses a container that is not empty).
 */
const CONTAINER_ACTIONS: ActionTable<ContainerActionId, Container> = {
  rules: [
    { id: "open", label: "Open" },
    {
      id: "delete",
      label: (container) =>
        container.object_count > 0
          ? `Delete container and ${containerContents(container)}`
          : "Delete container",
      tone: "danger",
    },
  ],
};

/** The container's menu, every action with its availability. */
export function availableContainerActions(container: Container) {
  return offerActions(CONTAINER_ACTIONS, container);
}

export type ObjectActionId =
  "open" | "download" | "details" | "copy" | "delete";

/** A folder opens, or goes with everything in it. */
const FOLDER_ACTIONS: ActionTable<ObjectActionId, StoreObject> = {
  rules: [
    { id: "open", label: "Open folder" },
    { id: "delete", label: "Delete folder and contents", tone: "danger" },
  ],
};

/** An object downloads, shows its details, copies (unless empty) or goes. */
const FILE_ACTIONS: ActionTable<ObjectActionId, StoreObject> = {
  rules: [
    { id: "download", label: "Download" },
    { id: "details", label: "View details" },
    {
      id: "copy",
      label: "Copy",
      checks: [
        (object) => object.bytes === 0 && "Empty objects cannot be copied",
      ],
    },
    { id: "delete", label: "Delete", tone: "danger" },
  ],
};

/**
 * The menu of one row in a container: a folder and an object are different
 * things, each with its own actions, so each has its own menu.
 */
export function availableObjectActions(object: StoreObject) {
  return offerActions(object.is_folder ? FOLDER_ACTIONS : FILE_ACTIONS, object);
}
