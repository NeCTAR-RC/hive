import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { stubResizeObserver } from "../../../components/testing/resizeObserver";
import type { Image, LaunchOptions } from "../../../lib/api/types";
import {
  launchSchema,
  useNewVolumeRules,
  useSourceTypeReset,
  type LaunchForm,
} from "./launchForm";
import { SourceStep } from "./LaunchSourceStep";

const image = {
  id: "img-1",
  name: "Ubuntu 24.04",
  visibility: "public",
  size: 650 * 1024 ** 2,
  min_disk: 10,
  min_ram: 0,
  is_snapshot: false,
  hidden_until_search: false,
} as unknown as Image;

const community = {
  ...image,
  id: "img-comm",
  name: "Someone's bioinformatics image",
  visibility: "community",
  hidden_until_search: true,
} as unknown as Image;

const DATA = {
  flavors: [
    {
      id: "f-small",
      name: "m3.small",
      vcpus: 2,
      ram_mb: 4096,
      disk_gb: 30,
      is_reservation: false,
    },
    {
      id: "res-1",
      name: "reservation:res-1",
      vcpus: 2,
      ram_mb: 4096,
      disk_gb: 30,
      is_reservation: true,
    },
  ],
  flavor_classes: [],
  volume_types: [
    { id: "t-std", name: "standard", description: null, zones: null },
    {
      id: "t-qh2",
      name: "qh2-ssd",
      description: "Local SSD",
      zones: ["melbourne-qh2"],
    },
    { id: "t-mon", name: "monash-ssd", description: null, zones: ["monash"] },
  ],
  has_zoned_types: true,
  images: [image, community],
  snapshots: [],
  volumes: [
    {
      id: "vol-1",
      name: "data",
      size_gb: 10,
      availability_zone: "melbourne",
    },
  ],
  volume_snapshots: [],
  networks: [],
  key_pairs: [],
  security_groups: [],
  availability_zones: [],
  server_groups: [],
  limits: null,
  errors: {},
  defaults: {
    create_volume: false,
    config_drive: false,
    network_ports: false,
    classic_network_id: null,
    preemptible_notice: "",
  },
} as unknown as LaunchOptions;

const DEFAULTS: LaunchForm = {
  name: "",
  description: "",
  availability_zone: "",
  count: 1,
  source_type: "image",
  source_id: "",
  delete_volume_on_termination: false,
  create_volume: false,
  volume_size_gb: undefined,
  volume_size_min_gb: 1,
  volume_type: "",
  flavor_class: "",
  flavor_id: "",
  networks: [],
  ports: [],
  security_groups: [],
  key_name: "",
  user_data: "",
  server_group_id: "",
  metadata: [],
};

function Harness({ initial = {} }: { initial?: Partial<LaunchForm> }) {
  const form = useForm<LaunchForm>({
    resolver: zodResolver(launchSchema),
    defaultValues: { ...DEFAULTS, ...initial },
  });
  useSourceTypeReset(form);
  useNewVolumeRules(form, DATA);
  const [sourceId, deleteVolume, size, volumeType, createVolume] = useWatch({
    control: form.control,
    name: [
      "source_id",
      "delete_volume_on_termination",
      "volume_size_gb",
      "volume_type",
      "create_volume",
    ],
  });
  return (
    <>
      <SourceStep form={form} data={DATA} />
      <button
        type="button"
        onClick={() => form.setValue("availability_zone", "melbourne-qh2")}
      >
        Set zone
      </button>
      <button
        type="button"
        onClick={() => form.setValue("flavor_id", "f-small")}
      >
        Set flavour
      </button>
      <button type="button" onClick={() => form.setValue("flavor_id", "res-1")}>
        Set reservation flavour
      </button>
      <output aria-label="Create volume">{String(createVolume)}</output>
      <output aria-label="Source id">{sourceId}</output>
      <output aria-label="Delete volume">{String(deleteVolume)}</output>
      <output aria-label="Volume size">
        {size === undefined ? "" : String(size)}
      </output>
      <output aria-label="Volume type">{volumeType}</output>
    </>
  );
}

describe("SourceStep", () => {
  beforeAll(() => {
    stubResizeObserver();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("turns the new volume off for a reservation flavour, which sends no zone", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toggle = screen.getByRole("switch", { name: /Create a new volume/ });
    await user.click(screen.getByRole("button", { name: "Set zone" }));
    await user.click(screen.getByRole("radio", { name: /Ubuntu 24.04/ }));
    await user.click(toggle);
    expect(screen.getByLabelText("Create volume")).toHaveTextContent("true");

    await user.click(
      screen.getByRole("button", { name: "Set reservation flavour" }),
    );
    expect(screen.getByLabelText("Create volume")).toHaveTextContent("false");
    expect(toggle).toBeDisabled();
    expect(
      screen.getByText(/Not available with a reservation flavour/),
    ).toBeInTheDocument();
  });

  it("clears the chosen source when the boot-source type changes", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("radio", { name: /Ubuntu 24.04/ }));
    expect(screen.getByLabelText("Source id")).toHaveTextContent("img-1");

    await user.click(screen.getByRole("radio", { name: "Volume" }));
    expect(screen.getByLabelText("Source id")).toBeEmptyDOMElement();
    expect(screen.getByRole("radio", { name: /data/ })).not.toBeChecked();

    await user.click(screen.getByRole("radio", { name: /data/ }));
    await user.click(screen.getByRole("switch", { name: /Delete the volume/ }));
    expect(screen.getByLabelText("Source id")).toHaveTextContent("vol-1");
    expect(screen.getByLabelText("Delete volume")).toHaveTextContent("true");

    await user.click(screen.getByRole("radio", { name: "Image" }));
    expect(screen.getByLabelText("Source id")).toBeEmptyDOMElement();
    expect(screen.getByLabelText("Delete volume")).toHaveTextContent("false");
    expect(
      screen.getByRole("radio", { name: /Ubuntu 24.04/ }),
    ).not.toBeChecked();
  });

  it("names the chosen source above the list and keeps it listed", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText("No source selected yet.")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Ubuntu 24.04/ }));
    expect(
      screen.getByText("Ubuntu 24.04", { selector: "strong" }),
    ).toBeVisible();

    // A search that misses the chosen image still lists it, checked, and
    // nothing else.
    await user.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByRole("radio", { name: /Ubuntu 24.04/ })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /bioinformatics/ })).toBeNull();
    expect(screen.queryByText("Nothing matches.")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByLabelText("Source id")).toBeEmptyDOMElement();
    expect(screen.getByText("No source selected yet.")).toBeInTheDocument();
  });

  it("lists a preselected community image and scrolls to it", () => {
    render(<Harness initial={{ source_id: "img-comm" }} />);
    expect(screen.getByRole("radio", { name: /bioinformatics/ })).toBeChecked();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("offers a new volume once a zone is chosen, sized from the image and flavour", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toggle = screen.getByRole("switch", { name: /Create a new volume/ });
    expect(toggle).toBeDisabled();
    expect(
      screen.getByText(/Choose an availability zone on the Details step/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Set zone" }));
    expect(toggle).toBeEnabled();
    await user.click(screen.getByRole("radio", { name: /Ubuntu 24.04/ }));
    await user.click(toggle);

    // The floor is the image's min_disk (its 650 MB round up to 1 GB).
    expect(screen.getByLabelText("Volume size")).toHaveTextContent("10");
    expect(screen.getByRole("textbox", { name: /Volume size/ })).toHaveValue(
      "10",
    );
    expect(screen.getByText(/At least 10 GB/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Volume type/ }),
    ).toHaveTextContent("Default volume type");
    expect(
      screen.getByRole("switch", { name: /Delete the volume/ }),
    ).toBeInTheDocument();

    // A flavour with a larger root disk raises the size.
    await user.click(screen.getByRole("button", { name: "Set flavour" }));
    expect(screen.getByLabelText("Volume size")).toHaveTextContent("30");
    expect(screen.getByText(/m3.small root disk is 30 GB/)).toBeInTheDocument();

    // Changing the boot source drops the new-volume fields.
    await user.click(screen.getByRole("radio", { name: "Volume" }));
    expect(screen.getByLabelText("Volume size")).toBeEmptyDOMElement();
    expect(
      screen.queryByRole("switch", { name: /Create a new volume/ }),
    ).toBeNull();
  });
});
