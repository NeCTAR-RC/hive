// The key pair dialogs the launch wizard opens from its key pair step.
import type { UseFormReturn } from "react-hook-form";
import { CreateKeyPairDialog } from "../keypairs/dialogs/CreateKeyPairDialog";
import { ImportKeyPairDialog } from "../keypairs/dialogs/ImportKeyPairDialog";
import type { LaunchForm } from "./launchForm";
import type { KeyPairDialogMode } from "./steps/props";

/**
 * The create or import key pair dialog over the wizard, as `mode` says. A
 * key pair made in either is chosen in the form straight away.
 */
export function LaunchKeyPairDialogs({
  form,
  mode,
  onOpenChange,
}: {
  form: UseFormReturn<LaunchForm>;
  mode: KeyPairDialogMode;
  onOpenChange: (mode: KeyPairDialogMode) => void;
}) {
  const onCreated = (keyPair: { name: string }) => {
    form.setValue("key_name", keyPair.name, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };
  const onClose = () => onOpenChange(null);
  return (
    <>
      {mode === "create" && (
        <CreateKeyPairDialog onClose={onClose} onCreated={onCreated} />
      )}
      {mode === "import" && (
        <ImportKeyPairDialog onClose={onClose} onCreated={onCreated} />
      )}
    </>
  );
}
