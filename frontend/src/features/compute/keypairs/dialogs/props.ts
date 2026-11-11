// The props both key pair dialogs take, from the Key Pairs panel or the
// launch wizard.
import type { KeyPair } from "../../../../lib/api/types/compute";

/** How a key pair dialog closes, and who hears about the new key pair. */
export interface KeyPairDialogProps {
  onClose: () => void;
  /** Receives the new key pair, so a form can select it. */
  onCreated?: (keyPair: KeyPair) => void;
}
