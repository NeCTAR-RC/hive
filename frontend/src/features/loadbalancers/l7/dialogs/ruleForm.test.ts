import { describe, expect, it } from "vitest";
import {
  l7RuleCreateBody,
  l7RuleUpdateBody,
} from "../../../../mocks/loadbalancers/schemas";
import {
  COMPARE_TYPES,
  comparisonsFor,
  ruleBody,
  ruleSchema,
  ruleUpdateBody,
  type RuleValues,
} from "./ruleForm";

const values: RuleValues = {
  type: "PATH",
  compare_type: "STARTS_WITH",
  key: "",
  value: "/api",
  invert: false,
  admin_state_up: true,
};

describe("ruleBody", () => {
  it("leaves the key out of a rule without one", () => {
    const body = ruleBody(values);
    expect(body).toEqual({
      type: "PATH",
      compare_type: "STARTS_WITH",
      value: "/api",
      invert: false,
      admin_state_up: true,
    });
    expect(l7RuleCreateBody.parse(body)).toEqual(body);
  });

  it("sends the key of a header rule", () => {
    const body = ruleBody({
      ...values,
      type: "HEADER",
      compare_type: "EQUAL_TO",
      key: "X-Tenant",
      value: "nectar",
      invert: true,
    });
    expect(body).toEqual({
      type: "HEADER",
      compare_type: "EQUAL_TO",
      value: "nectar",
      invert: true,
      admin_state_up: true,
      key: "X-Tenant",
    });
    expect(l7RuleCreateBody.parse(body)).toEqual(body);
  });
});

describe("comparisonsFor", () => {
  it("offers a file type rule REGEX and EQUAL_TO only", () => {
    expect(comparisonsFor("FILE_TYPE", COMPARE_TYPES)).toEqual([
      "REGEX",
      "EQUAL_TO",
    ]);
    expect(comparisonsFor("PATH", COMPARE_TYPES)).toEqual(COMPARE_TYPES);
  });

  it("refuses a comparison the type does not allow", () => {
    const result = ruleSchema.safeParse({
      ...values,
      type: "FILE_TYPE",
      compare_type: "STARTS_WITH",
    });
    expect(result.error?.issues.map((i) => i.message)).toEqual([
      "Choose one of the comparisons listed for this type",
    ]);
  });
});

describe("ruleUpdateBody", () => {
  it("sends every field and clears the key of a rule without one", () => {
    const body = ruleUpdateBody({ ...values, key: "X-Left-Over" });
    expect(body).toEqual({
      type: "PATH",
      compare_type: "STARTS_WITH",
      key: null,
      value: "/api",
      invert: false,
      admin_state_up: true,
    });
    expect(l7RuleUpdateBody.parse(body)).toEqual(body);
  });

  it("keeps the key of a cookie rule", () => {
    expect(
      ruleUpdateBody({
        ...values,
        type: "COOKIE",
        compare_type: "EQUAL_TO",
        key: "session",
      }).key,
    ).toBe("session");
  });
});
