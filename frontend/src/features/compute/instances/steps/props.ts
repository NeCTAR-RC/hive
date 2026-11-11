// The props the launch page hands every step, and the key pair dialog the
// key pair step can open over the wizard.
import type { LaunchOptions } from "../../../../lib/api/types/compute";

/** Which key pair dialog is open over the wizard, if any. */
export type KeyPairDialogMode = "create" | "import" | null;

/** What every launch step gets from the page. */
export interface LaunchStepProps {
  data: LaunchOptions;
  onOpenKeyPairDialog: (mode: KeyPairDialogMode) => void;
  /**
   * The flavour a `?flavor=` deep link named that the project cannot see
   * (a reservation that is not active, or another project's), or null.
   */
  missingFlavor: string | null;
}
