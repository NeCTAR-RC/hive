import { describe, expect, it } from "vitest";
import {
  stackCreateBody,
  validateTemplateBody,
} from "../../../mocks/orchestration/schemas";
import { templateFormValues, type TemplateFormValues } from "../status";
import {
  stackCreateRequest,
  stackUpdateRequest,
  templateSource,
} from "./request";

const pasted: TemplateFormValues = {
  source: "text",
  template: "heat_template_version: 2018-08-31",
  template_url: "https://example.org/ignored.yaml",
  environment: "parameters: {}",
};

describe("templateSource", () => {
  it.each([
    [
      "sends the pasted template and the environment",
      pasted,
      {
        template: "heat_template_version: 2018-08-31",
        environment: "parameters: {}",
      },
    ],
    [
      "sends the URL alone when the source is a URL",
      { ...pasted, source: "url", environment: "" },
      { template_url: "https://example.org/ignored.yaml" },
    ],
    [
      "leaves out an environment of blank lines",
      { ...pasted, environment: "  \n" },
      { template: "heat_template_version: 2018-08-31" },
    ],
  ] satisfies [string, TemplateFormValues, object][])(
    "%s",
    (_case, values, expected) => {
      const body = templateSource(values);
      expect(body).toEqual(expected);
      expect(validateTemplateBody.safeParse(body).success).toBe(true);
    },
  );

  it.each([pasted, { ...pasted, source: "url", environment: "" } as const])(
    "is read back by templateFormValues for Back (%#)",
    (values) => {
      const back = templateFormValues(templateSource(values));
      expect(back.source).toBe(values.source);
      expect(templateSource(back)).toEqual(templateSource(values));
    },
  );
});

describe("stackCreateRequest", () => {
  it("adds the name, settings and parameters to the validated source", () => {
    const body = stackCreateRequest(
      { template_url: "https://example.org/web.yaml" },
      { name: "web", timeout_mins: 60, rollback: true },
      { flavor: "m3.small", count: 2 },
    );
    expect(body).toEqual({
      template_url: "https://example.org/web.yaml",
      name: "web",
      parameters: { flavor: "m3.small", count: 2 },
      timeout_mins: 60,
      rollback: true,
    });
    expect(stackCreateBody.safeParse(body).success).toBe(true);
  });
});

describe("stackUpdateRequest", () => {
  it("adds the settings and parameters to the new source", () => {
    expect(
      stackUpdateRequest(
        {
          template: "heat_template_version: 2018-08-31",
          environment: "parameters: {}",
        },
        { timeout_mins: 30, rollback: false },
        {},
      ),
    ).toEqual({
      template: "heat_template_version: 2018-08-31",
      environment: "parameters: {}",
      parameters: {},
      timeout_mins: 30,
      rollback: false,
    });
  });
});
