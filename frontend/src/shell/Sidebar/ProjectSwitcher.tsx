import { useState } from "react";
import {
  Dialog as AriaDialog,
  DialogTrigger,
  ListBox,
  ListBoxItem,
  Popover,
} from "react-aria-components";
import { Button, ChevronDown, SearchField } from "@ardc-ui/react";
import type { Me } from "../../lib/api/types";
import { useSwitchProject } from "../../lib/queries";
import { notify } from "../../lib/notify";
import { loadingProps } from "../../components/buttonState";
import styles from "./ProjectSwitcher.module.scss";

const SEARCH_THRESHOLD = 8;

/**
 * The sidebar's project selector: a button showing the current project that
 * opens a filterable, single-selection list, with the filter focused.
 *
 * Built from react-aria's Popover and ListBox around DS Button and
 * SearchField because @ardc-ui/react 5.1.0 has no filterable selection
 * menu: DS Menu renders its own Popover, so a SearchField cannot sit inside
 * it, and DS Combobox would replace the button with a text input holding
 * the project name. A design-system gap (review 2026-10, section 5.4);
 * swap to the DS part once one exists.
 */
export function ProjectSwitcher({ me }: { me: Me }) {
  const switchProject = useSwitchProject();
  const [filter, setFilter] = useState("");
  const projects = me.projects.filter((p) =>
    p.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className={styles.switcher}>
      <p className={styles.label}>Project</p>
      <DialogTrigger>
        {/* One element throughout, so focus stays on it while pending. */}
        <Button
          variant="secondary"
          size="sm"
          className={styles.trigger}
          isPending={switchProject.isPending}
          {...loadingProps(switchProject.isPending, "Switching project")}
        >
          <span className={styles.triggerName}>{me.project.name}</span>
          <ChevronDown aria-hidden="true" />
        </Button>
        <Popover placement="bottom start" className={styles.popover}>
          <AriaDialog aria-label="Switch project" className={styles.dialog}>
            {({ close }) => (
              <>
                {me.projects.length > SEARCH_THRESHOLD && (
                  <SearchField
                    size="sm"
                    // The user has just opened this popover, so moving
                    // focus into it is the expected dialog behaviour; the
                    // rule guards against focus stolen on page load.
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    aria-label="Filter projects"
                    placeholder="Filter projects"
                    value={filter}
                    onChange={setFilter}
                    className={styles.search}
                  />
                )}
                <ListBox
                  aria-label="Projects"
                  className={styles.list}
                  selectionMode="single"
                  disallowEmptySelection
                  selectedKeys={[me.project.id]}
                  items={projects}
                  onSelectionChange={(keys) => {
                    const [id] = [...keys];
                    close();
                    if (id && id !== me.project.id) {
                      switchProject.mutate(String(id), {
                        onError: () =>
                          notify.danger("Could not switch project."),
                      });
                    }
                  }}
                >
                  {(project) => (
                    <ListBoxItem
                      id={project.id}
                      textValue={project.name}
                      className={styles.item}
                    >
                      {project.name}
                    </ListBoxItem>
                  )}
                </ListBox>
                {projects.length === 0 && (
                  <p className={styles.empty}>No projects match.</p>
                )}
              </>
            )}
          </AriaDialog>
        </Popover>
      </DialogTrigger>
    </div>
  );
}
