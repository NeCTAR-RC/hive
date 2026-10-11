// Create (from a file or a URL) and edit dialogs for images.
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Label, ProgressBar } from "@ardc-ui/react";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import {
  NumberInput,
  RadioInput,
  SelectInput,
  SwitchInput,
  TextInput,
} from "../../../components/Form/fields";
import { FileInput } from "../../../components/Form/FileInput";
import type { Image } from "../../../lib/api/types";
import { formatBytes } from "../../../lib/format";
import { notify } from "../../../lib/notify";
import { useCreateImage, useUpdateImage, useUploadImageFile } from "../api";
import styles from "./ImageDialogs.module.scss";

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
const VISIBILITIES: { id: Image["visibility"]; label: string }[] = [
  { id: "private", label: "Private (this project only)" },
  { id: "community", label: "Community (any project can find and use it)" },
];
const SOURCES = [
  { id: "file", label: "File from your computer" },
  { id: "url", label: "URL the image service downloads from" },
];

const createSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter a name")
      .max(255, "At most 255 characters"),
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

const editSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name")
    .max(255, "At most 255 characters"),
  visibility: z.enum(["private", "community", "shared", "public"]),
  min_disk: z.number().int().min(0, "Cannot be negative"),
  min_ram: z.number().int().min(0, "Cannot be negative"),
  protected: z.boolean(),
});

export function CreateImageDialog({
  projectId,
  isOpen,
  onOpenChange,
}: {
  projectId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateImage(projectId);
  const upload = useUploadImageFile(projectId);
  const [progress, setProgress] = useState<{
    sent: number;
    total: number;
  } | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
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

  const reset = () => {
    form.reset();
    setProgress(null);
    create.reset();
    upload.reset();
  };

  const submit = form.handleSubmit(async (values) => {
    const body = {
      name: values.name,
      disk_format: values.disk_format,
      container_format: "bare",
      visibility: values.visibility,
      min_disk: values.min_disk,
      min_ram: values.min_ram,
      protected: values.protected,
      properties: {},
      ...(values.source === "url" ? { source_url: values.source_url } : {}),
    };
    let image: Image;
    try {
      image = await create.mutateAsync(body);
    } catch {
      return; // shown by the dialog's error state
    }
    if (values.source === "url") {
      notify.success(
        `Image ${image.name} is being imported. It becomes active once the download completes.`,
      );
      reset();
      onOpenChange(false);
      return;
    }
    const file = values.file as File;
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
      reset();
      onOpenChange(false);
    } catch (error) {
      setProgress(null);
      if (error instanceof DOMException && error.name === "AbortError") {
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
  });

  const uploading = progress !== null;
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
      title="Create image"
      submitLabel="Create image"
      size="lg"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
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
          <button
            type="button"
            className={styles.cancel}
            onClick={() => controller?.abort()}
          >
            Cancel upload
          </button>
        </div>
      ) : (
        <>
          <TextInput
            control={form.control}
            name="name"
            label="Image name"
            isRequired
          />
          <RadioInput
            control={form.control}
            name="source"
            label="Image source"
            options={SOURCES}
          />
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
              control={form.control}
              name="source_url"
              label="Image URL"
              type="url"
              description="A direct HTTP or HTTPS link to the image file."
              isRequired
            />
          )}
          <SelectInput
            control={form.control}
            name="disk_format"
            label="Format"
            options={DISK_FORMATS.map((format) => ({
              id: format,
              label: format.toUpperCase(),
            }))}
            isRequired
          />
          <SelectInput
            control={form.control}
            name="visibility"
            label="Visibility"
            options={VISIBILITIES}
          />
          <NumberInput
            control={form.control}
            name="min_disk"
            label="Minimum disk"
            addon="GB"
            minValue={0}
            description="Flavours with a smaller root disk cannot use the image. 0 means no minimum."
          />
          <NumberInput
            control={form.control}
            name="min_ram"
            label="Minimum RAM"
            addon="MB"
            minValue={0}
          />
          <SwitchInput
            control={form.control}
            name="protected"
            label="Protected (cannot be deleted)"
          />
        </>
      )}
    </FormDialog>
  );
}

export function EditImageDialog({
  projectId,
  image,
  onClose,
}: {
  projectId: string;
  image: Image;
  onClose: () => void;
}) {
  const update = useUpdateImage(projectId);
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: image.name ?? "",
      visibility: image.visibility,
      min_disk: image.min_disk ?? 0,
      min_ram: image.min_ram ?? 0,
      protected: image.protected,
    },
  });
  const submit = form.handleSubmit((values) => {
    const body: Parameters<typeof update.mutate>[0] = { imageId: image.id };
    if (values.name !== image.name) body.name = values.name;
    if (values.visibility !== image.visibility)
      body.visibility = values.visibility;
    if (values.min_disk !== (image.min_disk ?? 0))
      body.min_disk = values.min_disk;
    if (values.min_ram !== (image.min_ram ?? 0)) body.min_ram = values.min_ram;
    if (values.protected !== image.protected) body.protected = values.protected;
    if (Object.keys(body).length === 1) {
      onClose();
      return;
    }
    update.mutate(body, {
      onSuccess: (updated) => {
        notify.success(`Image ${updated.name} updated.`);
        onClose();
      },
    });
  });
  const visibilities = VISIBILITIES.some((v) => v.id === image.visibility)
    ? VISIBILITIES
    : [{ id: image.visibility, label: image.visibility }, ...VISIBILITIES];
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Edit image ${image.name ?? ""}`}
      submitLabel="Save"
      size="lg"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
    >
      <TextInput
        control={form.control}
        name="name"
        label="Image name"
        isRequired
      />
      <SelectInput
        control={form.control}
        name="visibility"
        label="Visibility"
        options={visibilities}
      />
      <NumberInput
        control={form.control}
        name="min_disk"
        label="Minimum disk"
        addon="GB"
        minValue={0}
      />
      <NumberInput
        control={form.control}
        name="min_ram"
        label="Minimum RAM"
        addon="MB"
        minValue={0}
      />
      <SwitchInput
        control={form.control}
        name="protected"
        label="Protected (cannot be deleted)"
      />
    </FormDialog>
  );
}
