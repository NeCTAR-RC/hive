import type { Key } from "@ardc-ui/react";
import {
  Combobox,
  ComboboxItem,
  Label,
  Select,
  SelectItem,
  Text,
} from "@ardc-ui/react";
import type { Me } from "../../lib/api/types/session";
import { useSwitchProject } from "../../lib/queries";
import { notify } from "../../lib/notify";

/** Above this many projects the switcher becomes a combobox to type into. */
export const FILTER_THRESHOLD = 8;

/**
 * The project switcher at the top of the sidebar: the library Select, or the
 * library Combobox once the list is long enough to want filtering. Choosing a
 * project switches the session's project and says so ("Switched to
 * pt-1234."), then calls `onSwitched`. The field stays enabled while the
 * switch runs, so keyboard focus stays on it; a second choice meanwhile is
 * ignored.
 */
export function ProjectSwitcher({
  me,
  onSwitched,
}: {
  me: Me;
  onSwitched?: () => void;
}) {
  const switchProject = useSwitchProject();

  // A combobox reports null while its text is being edited; only a real,
  // different project starts a switch.
  const onSelectionChange = (key: Key | null) => {
    if (key === null || key === me.project.id) return;
    if (switchProject.isPending) return;
    switchProject.mutate(String(key), {
      onSuccess: (switched) => {
        notify.success(`Switched to ${switched.project.name}.`);
        onSwitched?.();
      },
      onError: () => notify.danger("Could not switch project."),
    });
  };

  // The library finds the label and helper text among its direct children
  // (an array is flattened, a fragment is not).
  const fieldChildren = [
    <Label key="label">Project</Label>,
    switchProject.isPending ? (
      <Text key="description" slot="description">
        Switching project
      </Text>
    ) : null,
  ];

  if (me.projects.length > FILTER_THRESHOLD) {
    return (
      <Combobox
        selectedKey={me.project.id}
        onSelectionChange={onSelectionChange}
        placeholder="Type to filter projects"
      >
        {fieldChildren}
        {me.projects.map((project) => (
          <ComboboxItem key={project.id} id={project.id}>
            {project.name}
          </ComboboxItem>
        ))}
      </Combobox>
    );
  }

  return (
    <Select selectedKey={me.project.id} onSelectionChange={onSelectionChange}>
      {fieldChildren}
      {me.projects.map((project) => (
        <SelectItem key={project.id} id={project.id}>
          {project.name}
        </SelectItem>
      ))}
    </Select>
  );
}
