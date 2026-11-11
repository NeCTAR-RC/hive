import { describe, expect, it } from "vitest";
import type {
  ClusterOptions,
  ClusterTemplate,
  TemplateCombination,
} from "../../../lib/api/types/kubernetes";
import {
  driversFor,
  isSingleMaster,
  nextPick,
  soleChoice,
  templateDefaults,
  templateFor,
  zonesFor,
} from "./cascade";

/** A template shaped like the mock's `t-133`. */
const calico: ClusterTemplate = {
  id: "t-133",
  name: "kubernetes-v1.33.4-ardctest-artm-calico-v5",
  coe: "kubernetes",
  image_id: "img-1",
  flavor_id: "m3.small",
  master_flavor_id: "m3.medium",
  keypair_id: null,
  network_driver: "calico",
  external_network_id: "ardctest-artm",
  fixed_network: null,
  fixed_subnet: null,
  dns_nameserver: "1.1.1.1",
  master_lb_enabled: true,
  floating_ip_enabled: false,
  tls_disabled: false,
  public: true,
  hidden: false,
  server_type: "vm",
  cluster_distro: "ubuntu",
  volume_driver: null,
  docker_storage_driver: "overlay2",
  docker_volume_size: null,
  registry_enabled: false,
  labels: {},
  kubernetes_version: "1.33.4",
  availability_zone: "ardctest-artm",
  template_version: "5",
  upgrade_targets: [],
  created_at: "2026-08-28T22:23:54+00:00",
  updated_at: null,
};

const flannel: ClusterTemplate = {
  ...calico,
  id: "t-flannel",
  network_driver: "flannel",
  master_lb_enabled: false,
};

const combinations: TemplateCombination[] = [
  {
    kubernetes_version: "1.33.4",
    availability_zone: "ardctest-artm",
    network_driver: "calico",
    template_id: "t-133",
  },
  {
    kubernetes_version: "1.33.4",
    availability_zone: "ardctest-artm",
    network_driver: "flannel",
    template_id: "t-flannel",
  },
  {
    kubernetes_version: "1.33.4",
    availability_zone: "melbourne-qh2",
    network_driver: "calico",
    template_id: "t-missing",
  },
  {
    kubernetes_version: "1.32.0",
    availability_zone: "monash-01",
    network_driver: "calico",
    template_id: "t-133",
  },
];

const options: ClusterOptions = {
  versions: ["1.32.0", "1.33.4"],
  availability_zones: ["ardctest-artm", "melbourne-qh2", "monash-01"],
  network_drivers: ["calico", "flannel"],
  combinations,
  templates: [calico, flannel],
  flavors: [
    { name: "m3.small", vcpus: 2, ram_mb: 4096, disk_gb: 30 },
    { name: "m3.medium", vcpus: 4, ram_mb: 8192, disk_gb: 30 },
  ],
  control_plane_sizes: [1, 3, 5, 7],
  quota: { clusters: 0, nodes: 0, hard_limit: 5 },
};

describe("templateFor", () => {
  it("finds the template behind a full combination", () => {
    expect(templateFor(options, "1.33.4", "ardctest-artm", "flannel")).toBe(
      flannel,
    );
  });

  it.each([
    ["an incomplete combination", "1.33.4", "ardctest-artm", ""],
    ["a combination not offered", "1.32.0", "ardctest-artm", "calico"],
    ["a template the options do not list", "1.33.4", "melbourne-qh2", "calico"],
  ])("finds no template for %s", (_case, version, zone, driver) => {
    expect(templateFor(options, version, zone, driver)).toBeUndefined();
  });

  it("finds no template before the options load", () => {
    expect(
      templateFor(undefined, "1.33.4", "ardctest-artm", "calico"),
    ).toBeUndefined();
  });
});

describe("zonesFor", () => {
  it("offers each zone of the version once, sorted", () => {
    expect(zonesFor(combinations, "1.33.4")).toEqual([
      "ardctest-artm",
      "melbourne-qh2",
    ]);
  });

  it("offers nothing before a version is chosen", () => {
    expect(zonesFor(combinations, "")).toEqual([]);
  });
});

describe("driversFor", () => {
  it("offers the drivers of the version and zone, sorted", () => {
    expect(driversFor(combinations, "1.33.4", "ardctest-artm")).toEqual([
      "calico",
      "flannel",
    ]);
  });

  it("offers nothing before a zone is chosen", () => {
    expect(driversFor(combinations, "1.33.4", "")).toEqual([]);
  });
});

describe("soleChoice", () => {
  it.each([
    [[], undefined],
    [["1.33.4"], "1.33.4"],
    [["1.32.0", "1.33.4"], undefined],
  ])("picks from %j: %s", (offered, expected) => {
    expect(soleChoice(offered)).toBe(expected);
  });
});

describe("nextPick", () => {
  it.each([
    ["clears a choice no longer offered", "monash-01", ["ardctest-artm"], ""],
    [
      "keeps a choice still offered",
      "ardctest-artm",
      ["ardctest-artm", "melbourne-qh2"],
      undefined,
    ],
    [
      "selects the sole choice for an empty picker",
      "",
      ["ardctest-artm"],
      "ardctest-artm",
    ],
    [
      "leaves an empty picker with several choices",
      "",
      ["ardctest-artm", "melbourne-qh2"],
      undefined,
    ],
    ["leaves an empty picker with no choices", "", [], undefined],
  ])("%s", (_case, current, offered, expected) => {
    expect(nextPick(current, offered)).toBe(expected);
  });
});

describe("isSingleMaster", () => {
  it.each([
    ["a template without a control plane load balancer", flannel, true],
    ["a template with one", calico, false],
    [
      "a template that does not say",
      { ...calico, master_lb_enabled: null },
      false,
    ],
    ["no template", undefined, false],
  ])("reads %s as %s", (_case, template, expected) => {
    expect(isSingleMaster(template)).toBe(expected);
  });
});

describe("templateDefaults", () => {
  const empty = { master_flavor_id: "", flavor_id: "" };

  it("fills both flavours into empty fields", () => {
    expect(templateDefaults(calico, options.flavors, empty)).toEqual({
      master_flavor_id: "m3.medium",
      flavor_id: "m3.small",
    });
  });

  it("keeps flavours the user has already chosen", () => {
    expect(
      templateDefaults(calico, options.flavors, {
        master_flavor_id: "m3.small",
        flavor_id: "m3.medium",
      }),
    ).toEqual({});
  });

  it("skips a flavour that is not offered", () => {
    expect(
      templateDefaults(
        { ...calico, master_flavor_id: "m3.xxlarge", flavor_id: null },
        options.flavors,
        empty,
      ),
    ).toEqual({});
  });

  it("sets one control plane node for a single master template", () => {
    expect(templateDefaults(flannel, [], empty)).toEqual({
      master_count: "1",
    });
  });
});
