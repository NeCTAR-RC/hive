// The manage attachments dialog: the instances holding the volume, each
// with a confirmed detach, and a form to attach it to another.
import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Dialog, Modal } from "@ardc-ui/react";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { Form } from "../../../../components/Form/Form";
import { fieldsFor } from "../../../../components/Form/fields";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { loadingProps } from "../../../../components/buttonState";
import type { Volume } from "../../../../lib/api/types/volumes";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { notify } from "../../../../lib/notify";
import { instancesQuery } from "../../../compute/api";
import { useAttachVolume, useDetachVolume, volumeQuery } from "../../api";
import { attachmentLabel } from "../../status";
import { attachBlockReason, attachCandidates, attachOptions } from "../rules";
import styles from "../VolumeDialogs.module.scss";
import { attachVolumeSchema, type AttachVolumeValues } from "./schema";

/**
 * Lists the volume's attachments with a detach for each, asked inline, and
 * attaches it to another instance when the volume is free or multi-attach.
 * The dialog follows the volume as it changes: a detach keeps it open, so
 * the user can attach the volume elsewhere once it is available; an attach
 * closes it.
 */
export function ManageAttachmentsDialog({
  volume: opened,
  onClose,
}: {
  volume: Volume;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const formId = useId();
  // The volume as it is now (the query polls while it changes); the one the
  // dialog opened with stands in until the first reply.
  const volume = useQuery(volumeQuery(projectId, opened.id)).data ?? opened;
  const instances = useQuery(instancesQuery(projectId));
  const attach = useAttachVolume();
  const detach = useDetachVolume();
  const [confirming, setConfirming] = useState<string | null>(null);
  const names = new Map(
    (instances.data?.items ?? []).map((i) => [i.id, i.name] as const),
  );
  const candidates = attachCandidates(instances.data?.items ?? [], volume);
  // Instances in another zone are listed, disabled, but cannot be chosen.
  const options = attachOptions(candidates, volume);
  const attachable = options.filter((option) => !option.isDisabled);
  const blocked = attachBlockReason(volume);
  const canAttach = blocked === null;
  const detaching = volume.status === "detaching";
  const busy = attach.isPending || detach.isPending;

  const { SelectInput, TextInput } = fieldsFor<AttachVolumeValues>();
  // The attach form is one part of this dialog: it submits through the
  // dialog's own action row, and its error shows with the detach errors.
  const { form, dialog: attachForm } = useMutationForm({
    schema: attachVolumeSchema,
    defaultValues: { instance_id: "", device: "" },
    mutation: attach,
    toVariables: (values) => ({
      volumeId: volume.id,
      instanceId: values.instance_id,
      ...(values.device ? { device: values.device } : {}),
    }),
    successMessage: (result, values) =>
      `Attaching volume ${volume.name || volume.id} to ${names.get(values.instance_id) ?? values.instance_id}${result.device ? ` on ${result.device}` : ""}.`,
    onDone: onClose,
  });

  const confirmDetach = (instanceId: string) => {
    detach.mutate(
      { volumeId: volume.id, instanceId },
      {
        onSuccess: () => {
          notify.success(
            `Detaching volume ${volume.name || volume.id} from ${names.get(instanceId) ?? instanceId}.`,
          );
          setConfirming(null);
        },
      },
    );
  };

  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && !busy && onClose()}
      size="lg"
      isDismissable
    >
      <Dialog
        title={`Manage attachments for ${volume.name || volume.id}`}
        closeLabel="Close"
        actions={
          <>
            <Button variant="secondary" slot="close" isDisabled={busy}>
              Close
            </Button>
            {canAttach && (
              <Button
                variant="primary"
                type="submit"
                form={formId}
                isDisabled={
                  detach.isPending || (!busy && attachable.length === 0)
                }
                {...loadingProps(attach.isPending, "Attaching...")}
              >
                Attach volume
              </Button>
            )}
          </>
        }
      >
        <div className={styles.groups}>
          {attach.error || detach.error ? (
            <ErrorState
              error={attach.error ?? detach.error}
              title="Could not update attachments"
            />
          ) : null}
          <section className={styles.group}>
            <h3 className={styles.subheading}>Attached to</h3>
            {volume.attachments.length === 0 ? (
              <p className={styles.muted}>Not attached to any instance.</p>
            ) : (
              <>
                <p className={styles.muted}>
                  {detaching
                    ? "Detaching. The list updates when the volume is free."
                    : "Unmount the file system inside the instance first, or data may be lost."}
                </p>
                <ul className={styles.attachmentList}>
                  {volume.attachments.map((attachment) => (
                    <li key={attachment.id ?? attachment.server_id ?? ""}>
                      <Card tone="grey">
                        <div className={styles.attachment}>
                          <span>
                            {attachmentLabel(
                              attachment,
                              attachment.server_id
                                ? names.get(attachment.server_id)
                                : undefined,
                            )}
                          </span>
                          {confirming === attachment.server_id ? (
                            <span className={styles.confirmDetach}>
                              <span>Detach?</span>
                              <Button
                                variant="secondary"
                                tone="danger"
                                size="xs"
                                isDisabled={busy}
                                onPress={() =>
                                  attachment.server_id &&
                                  confirmDetach(attachment.server_id)
                                }
                              >
                                Yes, detach
                              </Button>
                              <Button
                                variant="secondary"
                                size="xs"
                                isDisabled={busy}
                                onPress={() => setConfirming(null)}
                              >
                                Keep
                              </Button>
                            </span>
                          ) : (
                            <Button
                              variant="secondary"
                              size="xs"
                              isDisabled={
                                busy || detaching || !attachment.server_id
                              }
                              onPress={() =>
                                setConfirming(attachment.server_id)
                              }
                            >
                              Detach
                            </Button>
                          )}
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          {canAttach ? (
            <Form
              form={form}
              onValid={attachForm.onValid}
              id={formId}
              className={styles.group}
            >
              <h3 className={styles.subheading}>Attach to an instance</h3>
              <SelectInput
                name="instance_id"
                label="Instance"
                options={options}
                isRequired
                isDisabled={instances.isPending || attachable.length === 0}
                placeholder={
                  instances.isPending
                    ? "Loading instances..."
                    : attachable.length === 0
                      ? "No running or shut off instances in this zone"
                      : "Choose an instance"
                }
                description="Only active or shut off instances in the volume's zone can take a volume."
              />
              <TextInput
                name="device"
                label="Device name"
                description="Optional, such as /dev/vdc. The hypervisor may pick a different name."
              />
            </Form>
          ) : (
            <p className={styles.muted}>{blocked}</p>
          )}
        </div>
      </Dialog>
    </Modal>
  );
}
