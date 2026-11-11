import { Alert, Button, Card } from "@ardc-ui/react";
import {
  useFieldArray,
  useFormContext,
  useFormState,
  type FieldValues,
} from "react-hook-form";
import { fieldsFor } from "./fields";
import type { KeyValueEntry } from "./keyValue";
import styles from "./KeyValueFields.module.scss";

/**
 * Editable key and value rows (metadata, properties) for the list field
 * `name` of the surrounding form, which validates it with `keyValueSchema`.
 * The list's own error (a repeated key) shows above the rows; each row is
 * a grey library `Card` with its key, value and a "Remove" link button,
 * and `addLabel` names the button that adds a row. `emptyText` says so
 * when there are no rows; without it nothing shows.
 *
 * It renders its parts without a wrapper, so they follow the spacing of
 * the form or group around them.
 */
export function KeyValueFields({
  name,
  addLabel,
  emptyText,
}: {
  name: string;
  addLabel: string;
  emptyText?: string;
}) {
  // The list's name is only known at run time, so the form is typed loosely
  // here; `keyValueSchema` holds the rows' shape.
  const { control } = useFormContext<FieldValues>();
  const rows = useFieldArray({ control, name });
  const { errors } = useFormState({ control, name });
  const listError: unknown = errors[name]?.root?.message;
  const { TextInput } = fieldsFor<FieldValues>();
  const blank: KeyValueEntry = { key: "", value: "" };
  return (
    <>
      {typeof listError === "string" && listError && (
        <Alert tone="danger" role="alert">
          {listError}
        </Alert>
      )}
      {rows.fields.length === 0 && emptyText && <p>{emptyText}</p>}
      {rows.fields.length > 0 && (
        <div className={styles.rows}>
          {rows.fields.map((field, index) => (
            <Card key={field.id} tone="grey">
              <div className={styles.row}>
                <TextInput
                  name={`${name}.${index}.key`}
                  label="Key"
                  isRequired
                />
                <TextInput name={`${name}.${index}.value`} label="Value" />
                <div className={styles.remove}>
                  <Button
                    variant="link"
                    size="xs"
                    onPress={() => rows.remove(index)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <div className={styles.add}>
        <Button
          variant="secondary"
          size="xs"
          iconBefore="plus"
          onPress={() => rows.append(blank)}
        >
          {addLabel}
        </Button>
      </div>
    </>
  );
}
