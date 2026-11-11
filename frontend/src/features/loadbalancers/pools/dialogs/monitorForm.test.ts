import { describe, expect, it } from "vitest";
import {
  monitorCreateBody,
  monitorUpdateBody,
} from "../../../../mocks/loadbalancers/schemas";
import { monitorBody, type MonitorValues } from "./monitorForm";

/** An HTTP monitor with a blank path and codes. */
const values: MonitorValues = {
  name: "web-check",
  type: "HTTP",
  delay: 5,
  timeout: 5,
  max_retries: 3,
  max_retries_down: 3,
  http_method: "GET",
  url_path: "",
  expected_codes: "",
  admin_state_up: true,
};

describe("monitorBody", () => {
  it.each<[string, MonitorValues, Record<string, unknown>]>([
    [
      "sends an HTTP check, a blank path and codes as / and 200",
      values,
      {
        name: "web-check",
        delay: 5,
        timeout: 5,
        max_retries: 3,
        max_retries_down: 3,
        admin_state_up: true,
        http_method: "GET",
        url_path: "/",
        expected_codes: "200",
      },
    ],
    [
      "sends the path and codes of an HTTPS check as typed",
      {
        ...values,
        type: "HTTPS",
        http_method: "HEAD",
        url_path: "/healthz",
        expected_codes: "200-204",
      },
      {
        name: "web-check",
        delay: 5,
        timeout: 5,
        max_retries: 3,
        max_retries_down: 3,
        admin_state_up: true,
        http_method: "HEAD",
        url_path: "/healthz",
        expected_codes: "200-204",
      },
    ],
    [
      "sends no HTTP check for a TCP monitor",
      { ...values, type: "TCP", delay: 10, max_retries_down: 2 },
      {
        name: "web-check",
        delay: 10,
        timeout: 5,
        max_retries: 3,
        max_retries_down: 2,
        admin_state_up: true,
      },
    ],
  ])("%s", (_, input, expected) => {
    const body = monitorBody(input);
    expect(body).toEqual(expected);
    // A create adds the pool and the type; an update sends the body alone.
    const created = { pool_id: "p-1", type: input.type, ...body };
    expect(monitorCreateBody.parse(created)).toEqual(created);
    expect(monitorUpdateBody.parse(body)).toEqual(body);
  });
});
