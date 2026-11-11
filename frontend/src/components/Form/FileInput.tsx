import { useId } from "react";
import { FileTrigger } from "react-aria-components";
import { Button } from "@ardc-ui/react";
import { formatBytes } from "../../lib/format";
import styles from "./FileInput.module.scss";

export interface FileInputProps {
  label: string;
  value: File | null;
  onChange: (file: File | null) => void;
  description?: string;
  error?: string | undefined;
  isRequired?: boolean;
  isDisabled?: boolean;
  /** MIME types or extensions, as the input's accept attribute. */
  accept?: string[];
}

/**
 * A file picker in the shape of the library's fields: the label with its
 * helper text beneath, a "Choose file" button (React Aria's `FileTrigger`
 * owns the hidden input) with the chosen file's name and size, and the
 * validation message. The library has no file field, so this one copies the
 * text field's label, helper and error styles from the token bridge.
 */
export function FileInput({
  label,
  value,
  onChange,
  description,
  error,
  isRequired,
  isDisabled,
  accept,
}: FileInputProps) {
  const labelId = useId();
  const fileId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const describedBy = [
    fileId,
    description ? descriptionId : null,
    error ? errorId : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={styles.field}
      role="group"
      aria-labelledby={labelId}
      data-invalid={error ? "true" : undefined}
    >
      <div className={styles.header}>
        <span id={labelId} className={styles.label}>
          {label}
          {isRequired && (
            <span className={styles.required} aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </span>
        {description && (
          <span id={descriptionId} className={styles.description}>
            {description}
          </span>
        )}
      </div>
      <div className={styles.row}>
        <FileTrigger
          onSelect={(files) => onChange(files?.item(0) ?? null)}
          acceptedFileTypes={accept}
        >
          <Button
            variant="secondary"
            size="sm"
            isDisabled={isDisabled}
            aria-describedby={describedBy}
          >
            {value ? "Choose a different file" : "Choose file"}
          </Button>
        </FileTrigger>
        <span id={fileId} className={styles.fileName}>
          {value
            ? `${value.name} (${formatBytes(value.size)})`
            : "No file chosen"}
        </span>
        {value && (
          <Button
            variant="link"
            size="sm"
            onPress={() => onChange(null)}
            isDisabled={isDisabled}
          >
            Remove
          </Button>
        )}
      </div>
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
