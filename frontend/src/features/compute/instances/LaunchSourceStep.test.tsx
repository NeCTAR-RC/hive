import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { beforeAll, describe, expect, it } from "vitest";
import { stubResizeObserver } from "../../../components/testing/resizeObserver";
import type { Image, LaunchOptions } from "../../../lib/api/types";
import {
  launchSchema,
  useSourceTypeReset,
  type LaunchForm,
} from "./launchForm";
import { SourceStep } from "./LaunchSourceStep";

const image = {
  id: "img-1",
  name: "Ubuntu 24.04",
  visibility: "public",
  size: 1024,
  min_disk: 0,
  min_ram: 0,
  is_snapshot: false,
  hidden_until_search: false,
} as unknown as Image;

const DATA = {
  flavors: [],
  images: [image],
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

function Harness() {
  const form = useForm<LaunchForm>({
    resolver: zodResolver(launchSchema),
    defaultValues: {
      name: "",
      description: "",
      availability_zone: "",
      count: 1,
      source_type: "image",
      source_id: "",
      delete_volume_on_termination: false,
      flavor_id: "",
      networks: [],
      ports: [],
      security_groups: [],
      key_name: "",
      user_data: "",
      server_group_id: "",
      metadata: [],
    },
  });
  useSourceTypeReset(form);
  const sourceId = useWatch({ control: form.control, name: "source_id" });
  const deleteVolume = useWatch({
    control: form.control,
    name: "delete_volume_on_termination",
  });
  return (
    <>
      <SourceStep form={form} data={DATA} />
      <output aria-label="Source id">{sourceId}</output>
      <output aria-label="Delete volume">{String(deleteVolume)}</output>
    </>
  );
}

describe("SourceStep", () => {
  beforeAll(() => {
    stubResizeObserver();
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
});
