import { describe, expect, it } from "vitest";
import { ApiError } from "../../lib/api/errors";
import { isSaidByAField, serverFieldErrors } from "./serverErrors";

function validation(detail: unknown) {
  return new ApiError(422, {
    error: "validation",
    message: "Enter valid CIDRs.",
    detail,
  });
}

const FIELDS = ["name", "allowed_cidrs"];

describe("serverFieldErrors", () => {
  it("names the last segment of loc that is a field", () => {
    const error = validation([
      {
        loc: ["body", "allowed_cidrs", 0],
        msg: "Value error, Enter valid CIDRs.",
        type: "value_error",
      },
      { loc: ["body", "name"], msg: "Field required", type: "missing" },
    ]);
    expect(serverFieldErrors(error, FIELDS)).toEqual([
      { field: "allowed_cidrs", message: "Enter valid CIDRs." },
      { field: "name", message: "Field required" },
    ]);
  });

  it("leaves out entries that name no field, or are not entries", () => {
    const error = validation([
      { loc: ["body"], msg: "Value error, Enter valid CIDRs." },
      "not an entry",
      { loc: "body", msg: "no list" },
    ]);
    expect(serverFieldErrors(error, FIELDS)).toEqual([]);
  });

  it("reads only a 422 with a detail list", () => {
    const detail = [{ loc: ["body", "name"], msg: "Bad name" }];
    expect(serverFieldErrors(new ApiError(400, { detail }), FIELDS)).toEqual(
      [],
    );
    expect(serverFieldErrors(validation(undefined), FIELDS)).toEqual([]);
    expect(serverFieldErrors(new Error("Bad name"), FIELDS)).toEqual([]);
  });
});

describe("isSaidByAField", () => {
  it("is true when a field carries the error's message", () => {
    const error = validation([]);
    const said = [{ field: "allowed_cidrs", message: "Enter valid CIDRs." }];
    expect(isSaidByAField(error, said)).toBe(true);
    expect(isSaidByAField(error, [])).toBe(false);
    expect(isSaidByAField(null, said)).toBe(false);
  });
});
