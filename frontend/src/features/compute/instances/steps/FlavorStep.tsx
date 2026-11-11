// The launch wizard's flavour step: the flavour classes as cards, then a
// searchable single-select table of the open class's flavours with their
// cost in service units and their fit in the quota.
import { useMemo, useState } from "react";
import {
  Alert,
  Cell,
  Column,
  Row,
  SearchField,
  Table,
  TableBody,
  TableHeader,
} from "@ardc-ui/react";
import type { Selection } from "@ardc-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useFormContext, useWatch } from "react-hook-form";
import { ChoiceCards } from "../../../../components/ChoiceCards/ChoiceCards";
import { StatusPill } from "../../../../components/StatusPill/StatusPill";
import { formatGb, formatMb, formatNumber } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { reservationsQuery } from "../../../reservations/api";
import { flavorQuotaProblem, flavorTooSmall } from "../launch";
import {
  flavorDisplayName,
  flavorGroupId,
  flavorGroupMeta,
  flavorGroups,
  openFlavorGroup,
} from "../launchFlavors";
import {
  chosenImage,
  chosenVolumeFloor,
  volumeSizeAtFloor,
  type LaunchForm,
} from "../launchForm";
import type { LaunchStepProps } from "./props";
import { StepError } from "./StepError";
import styles from "../LaunchPage.module.scss";

/**
 * The flavour classes as cards (their flavour count, cheapest rate and
 * sentence), Reserved first when the project has reservation flavours and
 * Other for flavours with no class; then the open class's flavours,
 * cheapest first and filtered by name. A reservation flavour is named after
 * its reservation. A flavour chosen stays chosen while another class is
 * open. Flavours too small for the chosen image are disabled with the
 * reason in their notes (the root disk is not checked when a new volume
 * carries it). A flavour whose vCPUs or RAM, times the count, do not fit
 * the project's quota is marked, as Horizon flags it; choosing it stops
 * Next with the reason. A deep-linked flavour the project cannot see is
 * explained; choosing a preemptible flavour shows Nectar's preemptible
 * notice.
 */
export function FlavorStep({
  data,
  missingFlavor,
}: Pick<LaunchStepProps, "data" | "missingFlavor">) {
  const form = useFormContext<LaunchForm>();
  const projectId = useProjectId();
  const [query, setQuery] = useState("");
  const [chosen, opened, sourceType, sourceId, createVolume] = useWatch({
    control: form.control,
    name: [
      "flavor_id",
      "flavor_class",
      "source_type",
      "source_id",
      "create_volume",
    ],
  });
  // The count field is empty while the user retypes it.
  const count = useWatch({ control: form.control, name: "count" }) || 1;
  const image = chosenImage(data, {
    source_type: sourceType,
    source_id: sourceId,
  });
  const sorted = useMemo(
    () =>
      [...(data.flavors ?? [])].sort(
        // Cheapest first; flavours without a rate (special families) last.
        (a, b) =>
          (a.su_rate ?? Number.MAX_VALUE) - (b.su_rate ?? Number.MAX_VALUE) ||
          a.name.localeCompare(b.name),
      ),
    [data.flavors],
  );
  const groups = useMemo(
    () => flavorGroups(data.flavor_classes, sorted),
    [data.flavor_classes, sorted],
  );
  const selected = sorted.find((f) => f.id === chosen);
  const group = openFlavorGroup(groups, opened, selected);
  // Reservation flavours are named after their reservation once listed.
  const reservations = useQuery({
    ...reservationsQuery(projectId),
    enabled: sorted.some((f) => f.is_reservation),
  });
  const nameOf = (flavor: (typeof sorted)[number]) =>
    flavorDisplayName(flavor, reservations.data?.items);
  const needle = query.trim().toLowerCase();
  const listed = sorted.filter(
    (f) =>
      flavorGroupId(f) === group && nameOf(f).toLowerCase().includes(needle),
  );
  const tooSmall = (flavor: (typeof sorted)[number]) =>
    flavorTooSmall(flavor, image, createVolume);
  const disabled = listed.filter((f) => tooSmall(f)).map((f) => f.id);
  const error = form.formState.errors.flavor_id?.message;

  const onSelectionChange = (keys: Selection) => {
    const key = keys === "all" ? null : [...keys][0];
    const flavorId = key ? String(key) : "";
    form.setValue("flavor_id", flavorId, {
      shouldValidate: true,
      shouldDirty: true,
    });
    // A larger root disk raises a new volume's floor, as Horizon's source
    // step follows the flavour; a size the user typed above it is kept.
    if (form.getValues("create_volume")) {
      const raised = volumeSizeAtFloor(
        form.getValues("volume_size_gb"),
        chosenVolumeFloor(data, {
          source_type: sourceType,
          source_id: sourceId,
          flavor_id: flavorId,
        }),
      );
      if (raised !== undefined) {
        form.setValue("volume_size_gb", raised, { shouldDirty: true });
      }
    }
  };

  return (
    <div className={styles.fields}>
      {missingFlavor && !chosen && (
        <Alert tone="warning" role="status">
          The reserved flavour {missingFlavor} is not available to this project.
          Check that the reservation is active and that you are in the project
          that made it.
        </Alert>
      )}
      <p className={styles.hint}>
        Service units (SU) are charged per hour the instance exists, whether it
        is running or not. Choose a flavour class, then a flavour in it; a
        flavour you chose stays chosen while you look at other classes.
      </p>
      <ChoiceCards
        aria-label="Flavour class"
        value={group}
        onChange={(id) =>
          form.setValue("flavor_class", id, { shouldDirty: true })
        }
        options={groups.map((g) => ({
          id: g.id,
          title: g.title,
          meta: flavorGroupMeta(g, sorted),
          description: g.description,
        }))}
      />
      <SearchField
        size="sm"
        aria-label="Search flavours"
        value={query}
        onChange={setQuery}
        placeholder="Search this class's flavours, such as m3.large"
      />
      <Table
        aria-label="Flavours"
        selectionMode="single"
        selectedKeys={chosen ? new Set([chosen]) : new Set()}
        onSelectionChange={onSelectionChange}
        disabledKeys={disabled}
      >
        <TableHeader>
          <Column id="name" isRowHeader>
            Name
          </Column>
          <Column id="vcpus">vCPUs</Column>
          <Column id="ram">RAM</Column>
          <Column id="disk">Root disk</Column>
          <Column id="ephemeral">Ephemeral disk</Column>
          <Column id="rate">SU/hour</Column>
          <Column id="notes">Notes</Column>
        </TableHeader>
        <TableBody
          items={listed}
          // A row renders once per item; its name and notes read state
          // outside the item, so the rows render again when it changes.
          dependencies={[reservations.data, count, image, createVolume]}
          renderEmptyState={() => <p>No flavours match your search.</p>}
        >
          {(flavor) => (
            <Row id={flavor.id}>
              <Cell>{nameOf(flavor)}</Cell>
              <Cell>{flavor.vcpus ?? ""}</Cell>
              <Cell>{formatMb(flavor.ram_mb)}</Cell>
              <Cell>
                {flavor.disk_gb ? formatGb(flavor.disk_gb) : "volume"}
              </Cell>
              <Cell>
                {flavor.ephemeral_gb ? formatGb(flavor.ephemeral_gb) : "None"}
              </Cell>
              <Cell>
                {flavor.su_rate === null ? "" : formatNumber(flavor.su_rate)}
              </Cell>
              <Cell>
                {tooSmall(flavor) ?? (
                  <span className={styles.pills}>
                    {flavorQuotaProblem(data.limits, flavor, count) && (
                      <StatusPill tone="danger">
                        Does not fit your quota
                      </StatusPill>
                    )}
                    {flavor.is_preemptible && (
                      <StatusPill tone="warning">Preemptible</StatusPill>
                    )}
                  </span>
                )}
              </Cell>
            </Row>
          )}
        </TableBody>
      </Table>
      <StepError message={error} />
      {selected?.is_preemptible && (
        <Alert tone="warning" role="status">
          {data.defaults.preemptible_notice}
        </Alert>
      )}
    </div>
  );
}
