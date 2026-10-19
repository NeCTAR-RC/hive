import { describe, expect, it } from "vitest";
import type { LaunchForm } from "./launchForm";
import { STEPS, stepStatuses } from "./launchSteps";

const empty: LaunchForm = {
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

const complete: LaunchForm = {
  ...empty,
  name: "web",
  availability_zone: "melbourne-qh2",
  source_id: "img-1",
  flavor_class: "standard-v3",
  flavor_id: "f-small",
  networks: ["classic"],
};

describe("stepStatuses", () => {
  it("marks the steps whose required answers are missing as pending", () => {
    const statuses = stepStatuses(STEPS, empty, {});
    expect(statuses).toEqual({
      details: "pending",
      source: "pending",
      flavor: "pending",
      networks: "pending",
      security: undefined,
      keypair: undefined,
      config: undefined,
    });
  });

  it("marks nothing once every answer is in", () => {
    expect(Object.values(stepStatuses(STEPS, complete, {}))).toEqual(
      Array<undefined>(STEPS.length).fill(undefined),
    );
  });

  it("holds the source step for a new volume without a size, or below the floor", () => {
    expect(
      stepStatuses(STEPS, { ...complete, create_volume: true }, {}).source,
    ).toBe("pending");
    expect(
      stepStatuses(
        STEPS,
        {
          ...complete,
          create_volume: true,
          volume_size_gb: 5,
          volume_size_min_gb: 10,
        },
        {},
      ).source,
    ).toBe("pending");
    expect(
      stepStatuses(
        STEPS,
        {
          ...complete,
          create_volume: true,
          volume_size_gb: 10,
          volume_size_min_gb: 10,
        },
        {},
      ).source,
    ).toBeUndefined();
  });

  it("reports a step the form has flagged as invalid, ahead of pending", () => {
    const errors = {
      name: { type: "custom", message: "Enter an instance name" },
      user_data: { type: "max", message: "too long" },
    };
    const statuses = stepStatuses(STEPS, empty, errors);
    expect(statuses.details).toBe("invalid");
    expect(statuses.config).toBe("invalid");
    expect(statuses.source).toBe("pending");
  });
});
