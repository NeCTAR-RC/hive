import { describe, expect, it } from "vitest";
import {
  l7PolicyCreateBody,
  l7PolicyUpdateBody,
} from "../../../../mocks/loadbalancers/schemas";
import { policyBody, type PolicyValues } from "./policyForm";

/** A reject policy with every optional field empty. */
const values: PolicyValues = {
  name: "",
  description: "",
  action: "REJECT",
  redirect_url: "https://docs.example.org",
  redirect_pool_id: "p-1",
  redirect_prefix: "https://www.example.org",
  admin_state_up: true,
};

describe("policyBody", () => {
  it.each<[string, PolicyValues, ReturnType<typeof policyBody>]>([
    [
      "sends only the action and admin state for a bare reject",
      values,
      { action: "REJECT", admin_state_up: true },
    ],
    [
      "sends the name, description and position when they are set",
      {
        ...values,
        name: "block",
        description: "Blocks the admin path",
        position: 2,
        admin_state_up: false,
      },
      {
        action: "REJECT",
        admin_state_up: false,
        name: "block",
        description: "Blocks the admin path",
        position: 2,
      },
    ],
    [
      "sends only the URL for a redirect to a URL",
      { ...values, action: "REDIRECT_TO_URL" },
      {
        action: "REDIRECT_TO_URL",
        admin_state_up: true,
        redirect_url: "https://docs.example.org",
      },
    ],
    [
      "sends only the pool for a redirect to a pool",
      { ...values, action: "REDIRECT_TO_POOL" },
      {
        action: "REDIRECT_TO_POOL",
        admin_state_up: true,
        redirect_pool_id: "p-1",
      },
    ],
    [
      "sends only the prefix for a redirect by prefix",
      { ...values, action: "REDIRECT_PREFIX" },
      {
        action: "REDIRECT_PREFIX",
        admin_state_up: true,
        redirect_prefix: "https://www.example.org",
      },
    ],
  ])("%s", (_, input, expected) => {
    const body = policyBody(input);
    expect(body).toEqual(expected);
    // The mocked API accepts it, on a create and on an update.
    const created = { listener_id: "l-1", ...body };
    expect(l7PolicyCreateBody.parse(created)).toEqual(created);
    expect(l7PolicyUpdateBody.parse(body)).toEqual(body);
  });
});
