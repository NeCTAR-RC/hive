// The create image dialog: from a file or a URL.
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Label, ProgressBar } from "@ardc-ui/react";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { fieldsFor } from "../../../../components/Form/fields";
import { FileInput } from "../../../../components/Form/FileInput";
import type { Image } from "../../../../lib/api/types/compute";
import { formatBytes } from "../../../../lib/format";
import { notify } from "../../../../lib/notify";
import { useCreateImage, useUploadImageFile } from "../../api";
import { createImageRequest } from "./request";
import { VISIBILITIES } from "./visibilities";
import styles from "../ImageDialogs.module.scss";
import { maxLength } from "../../../../lib/validation";

const DISK_FORMATS = [
  "qcow2",
  "raw",
  "iso",
  "vmdk",
  "vdi",
  "vhd",
  "ami",
  "aki",
  "ari",
];
const SOURCES = [
  { id: "file", label: "File from your computer" },
  { id: "url", label: "URL the image service downloads from" },
];

const createSchema = z
  .object({
    name: maxLength(255).min(1, "Enter a name"),
    source: z.enum(["file", "url"]),
    file: z.instanceof(File).nullable(),
    source_url: z.string().trim(),
    disk_format: z.string().min(1, "Choose a format"),
    visibility: z.enum(["private", "community"]),
    min_disk: z.number().int().min(0, "Cannot be negative"),
    min_ram: z.number().int().min(0, "Cannot be negative"),
    protected: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.source === "file" && !values.file) {
      ctx.addIssue({
        code: "custom",
        path: ["file"],
        message: "Choose the image file",
      });
    }
    if (
      values.source === "url" &&
      !z.url().safeParse(values.source_url).success
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["source_url"],
        message: "Enter the full URL of the image file",
      });
    }
  });

/**
 * Creates an image from a file, uploaded from the browser with progress
 * and a cancel button, or from a URL the image service downloads from. A
 * failed upload leaves the queued image for the user to retry or delete.
 */
export function CreateImageDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateImage();
  const upload = useUploadImageFile();
  const [progress, setProgress] = useState<{
    sent: number;
    total: number;
  } | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  const { NumberInput, RadioInput, SelectInput, SwitchInput, TextInput } =
    fieldsFor<z.infer<typeof createSchema>>();
  // Create then upload with its own progress and cancel state, so the
  // dialog drives the form itself instead of through useMutationForm.
  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      source: "file",
      file: null,
      source_url: "",
      disk_format: "qcow2",
      visibility: "private",
      min_disk: 0,
      min_ram: 0,
      protected: false,
    },
  });
  const source = useWatch({ control: form.control, name: "source" });

  // Abort an upload in flight if the dialog unmounts; aborting a finished
  // request is a no-op.
  useEffect(() => () => controller?.abort(), [controller]);

  const submit = async (values: z.infer<typeof createSchema>) => {
    let image: Image;
    try {
      image = await create.mutateAsync(createImageRequest(values));
    } catch {
      return; // shown by the dialog's error state
    }
    if (values.source === "url") {
      notify.success(
        `Image ${image.name} is being imported. It becomes active once the download completes.`,
      );
      onClose();
      return;
    }
    // The schema requires a file for a file source.
    const file = values.file;
    if (!file) return;
    const abort = new AbortController();
    setController(abort);
    setProgress({ sent: 0, total: file.size });
    try {
      const uploaded = await upload.mutateAsync({
        imageId: image.id,
        file,
        onProgress: (sent, total) => setProgress({ sent, total }),
        signal: abort.signal,
      });
      notify.success(`Image ${uploaded.name} uploaded and ready to use.`);
      onClose();
    } catch (error) {
      setProgress(null);
      if (error instanceof DOMException && error.name === "AbortError") {
        // A cancel is the user's choice, not a failure to show in the form.
        upload.reset();
        notify.info(`Upload of ${image.name} cancelled.`);
        return;
      }
      // The failed upload leaves the queued record behind for the user to
      // retry or delete; say so rather than hiding it.
      notify.danger(
        `The file for ${image.name} did not upload. The image stays queued until you upload or delete it.`,
      );
    } finally {
      setController(null);
    }
  };

  const uploading = progress !== null;
  return (
    <FormDialog
      form={form}
      onValid={submit}
      onClose={onClose}
      title="Create image"
      submitLabel="Create image"
      size="lg"
      isPending={create.isPending || uploading}
      error={create.error ?? upload.error}
    >
      {uploading ? (
        <div className={styles.progress}>
          <ProgressBar
            value={progress.sent}
            maxValue={progress.total}
            formatOptions={{ style: "percent" }}
          >
            <Label>Uploading {form.getValues("file")?.name}</Label>
          </ProgressBar>
          <p className={styles.muted}>
            {formatBytes(progress.sent)} of {formatBytes(progress.total)}. Keep
            this page open until the upload finishes.
          </p>
          <div>
            <Button
              variant="secondary"
              tone="danger"
              size="xs"
              onPress={() => controller?.abort()}
            >
              Cancel upload
            </Button>
          </div>
        </div>
      ) : (
        <>
          <TextInput name="name" label="Image name" isRequired />
          <RadioInput name="source" label="Image source" options={SOURCES} />
          {source === "file" ? (
            <Controller
              control={form.control}
              name="file"
              render={({ field, fieldState }) => (
                <FileInput
                  label="Image file"
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                  description="The file streams to the image service while you wait; large files take a while."
                  isRequired
                />
              )}
            />
          ) : (
            <TextInput
              name="source_url"
              label="Image URL"
              type="url"
              description="A direct HTTP or HTTPS link to the image file."
              isRequired
            />
          )}
          <SelectInput
            name="disk_format"
            label="Format"
            options={DISK_FORMATS.map((format) => ({
              id: format,
              label: format.toUpperCase(),
            }))}
            isRequired
          />
          <SelectInput
            name="visibility"
            label="Visibility"
            options={VISIBILITIES}
          />
          <NumberInput
            name="min_disk"
            label="Minimum disk"
            addon="GB"
            minValue={0}
            description="Flavours with a smaller root disk cannot use the image. 0 means no minimum."
          />
          <NumberInput
            name="min_ram"
            label="Minimum RAM"
            addon="MB"
            minValue={0}
          />
          <SwitchInput name="protected" label="Protected (cannot be deleted)" />
        </>
      )}
    </FormDialog>
  );
}
