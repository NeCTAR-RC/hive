// The props every instance dialog takes from useInstanceActions.
import type { Instance } from "../../../../lib/api/types/compute";

/** The instance a dialog acts on, and how it closes. */
export interface InstanceDialogProps {
  instance: Instance;
  onClose: () => void;
}
