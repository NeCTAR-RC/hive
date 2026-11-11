// The subport rows the create trunk and add subports dialogs share.
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button, Card } from "@ardc-ui/react";
import { AppLink } from "../../../../components/AppLink/AppLink";
import { fieldsFor } from "../../../../components/Form/fields";
import type { Port } from "../../../../lib/api/types/network";
import { portLabel } from "./portLabel";
import type { SubportsForm } from "./schema";
import groups from "../../DialogGroups.module.scss";
import styles from "../TrunkDialogs.module.scss";

/**
 * The "Subports" group: one grey card per subport (port, segmentation type
 * and VLAN id, with its remove button), then the button that adds one. It
 * edits the `sub_ports` array of the form it renders in. With no free port
 * left to use it says so and points to where a port is created.
 */
export function SubportRows({
  candidates,
  isLoading,
}: {
  candidates: Port[];
  isLoading: boolean;
}) {
  const { NumberInput, SelectInput } = fieldsFor<SubportsForm>();
  const { control } = useFormContext<SubportsForm>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "sub_ports",
  });
  const rows = useWatch({ control, name: "sub_ports" });
  const chosen = new Set(rows.map((r) => r.port_id));
  return (
    <div className={groups.group}>
      <h3 className={groups.heading}>Subports</h3>
      {fields.length === 0 && !isLoading && candidates.length === 0 ? (
        <p className={styles.note}>
          No other free ports in this project. Create a port on one of your{" "}
          <AppLink size="sm" to="/network/networks" search={{}}>
            networks
          </AppLink>{" "}
          first; a subport carries a VLAN of its own on the trunk.
        </p>
      ) : fields.length === 0 ? (
        <p className={styles.note}>
          No subports yet. A subport carries a VLAN of its own on the trunk.
        </p>
      ) : (
        <ol className={styles.subportList} aria-label="Subports">
          {fields.map((field, index) => {
            const current = rows[index];
            return (
              <li key={field.id}>
                <Card tone="grey">
                  <div className={styles.subport}>
                    <SelectInput
                      name={`sub_ports.${index}.port_id`}
                      label={`Subport ${index + 1}`}
                      options={candidates
                        .filter(
                          (p) => p.id === current?.port_id || !chosen.has(p.id),
                        )
                        .map((p) => ({ id: p.id, label: portLabel(p) }))}
                      isRequired
                      isDisabled={isLoading}
                      placeholder={
                        isLoading ? "Loading ports..." : "Choose a port"
                      }
                    />
                    <SelectInput
                      name={`sub_ports.${index}.segmentation_type`}
                      label="Segmentation type"
                      options={[
                        { id: "vlan", label: "VLAN" },
                        { id: "inherit", label: "Inherit" },
                      ]}
                    />
                    {current?.segmentation_type !== "inherit" && (
                      <NumberInput
                        name={`sub_ports.${index}.segmentation_id`}
                        label="VLAN id"
                        minValue={1}
                        maxValue={4094}
                        isRequired
                      />
                    )}
                    <div className={groups.actions}>
                      <Button
                        variant="secondary"
                        size="xs"
                        onPress={() => remove(index)}
                      >
                        Remove subport {index + 1}
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
      <div className={groups.actions}>
        <Button
          variant="secondary"
          size="xs"
          onPress={() =>
            append({
              port_id: "",
              segmentation_type: "vlan",
              segmentation_id: null,
            })
          }
          isDisabled={candidates.length <= chosen.size}
        >
          Add subport
        </Button>
      </div>
    </div>
  );
}
