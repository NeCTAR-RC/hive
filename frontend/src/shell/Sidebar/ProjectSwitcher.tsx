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
import styles from "./ProjectSwitcher.module.scss";

const SEARCH_THRESHOLD = 8;

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
        {switchProject.isPending ? (
          <Button
            variant="secondary"
            size="sm"
            className={styles.trigger}
            state="loading"
            loadingText="Switching project"
          >
            <span className={styles.triggerName}>{me.project.name}</span>
          </Button>
        ) : (
          <Button variant="secondary" size="sm" className={styles.trigger}>
            <span className={styles.triggerName}>{me.project.name}</span>
            <ChevronDown aria-hidden="true" />
          </Button>
        )}
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
