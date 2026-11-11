// Every image action behind one hook, shared by the list and the detail
// page: `run(action, images)` launches from the image, opens the volume
// create dialog with the image as its source, opens the edit dialog, or
// asks before deleting. The hook returns the dialogs to render.
import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import type { Image } from "../../../lib/api/types/compute";
import { deleteImage, imageWriteKeys } from "../api";
import { EditImageDialog } from "./dialogs/EditImageDialog";
import { availableImageActions, type ImageActionId } from "./presentation";

/**
 * The image actions. `onDeleted` runs after a delete that succeeded, so the
 * detail page can return to the list.
 */
export function useImageActions(onDeleted?: () => void) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Image | null>(null);
  const bulk = useBulkAction<Image, "delete">({
    noun: { one: "image", many: "images" },
    name: (image) => image.name || image.id,
    getId: (image) => image.id,
    invalidates: imageWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (image) => deleteImage(image.id),
        eligible: (image) => allows(availableImageActions(image), "delete"),
        skippedWhy: "protected, or owned by another project",
        body: (
          <p>
            Instances already running from the image are not affected. This
            cannot be undone.
          </p>
        ),
        onSucceeded: () => onDeleted?.(),
      },
    },
  });

  const run = (action: ImageActionId, images: Image[]) => {
    const [first] = images;
    if (!first) return;
    if (action === "launch") {
      void navigate({
        to: "/compute/instances/launch",
        search: {
          source: `${first.is_snapshot ? "snapshot" : "image"}:${first.id}`,
        },
      });
    } else if (action === "create-volume") {
      void navigate({
        to: "/storage/volumes",
        search: { create: true, image: first.id },
      });
    } else if (action === "edit") {
      setEditing(first);
    } else {
      bulk.run(action, images);
    }
  };

  const dialogs: ReactNode = (
    <>
      {editing && (
        <EditImageDialog image={editing} onClose={() => setEditing(null)} />
      )}
      {bulk.dialog}
    </>
  );

  return { run, dialogs, tableProps: bulk.tableProps };
}
