import { describe, expect, it } from "vitest";
import {
  databaseNameError,
  databaseNamesError,
  passwordError,
  userNameError,
} from "./names";

describe("databaseNameError", () => {
  it.each([
    ["mysql", "app_db"],
    ["mariadb", "app-2"],
    ["postgresql", "My Reports"],
    ["redis", "anything goes"],
    [null, "x"],
  ])("accepts on %s: %s", (datastore, name) => {
    expect(databaseNameError(datastore, name)).toBeNull();
  });

  it.each([
    ["mysql", "bad name!", "bad name! is not a database name"],
    ["mysql", "x", "x is not a database name"],
    ["mysql", "a".repeat(65), "is not a database name"],
    ["mysql", "mysql", "mysql is reserved"],
    ["MySQL", "Sys", "Sys is reserved"],
    ["postgresql", "a".repeat(64), "is not a database name"],
  ])("refuses on %s: %s", (datastore, name, message) => {
    expect(databaseNameError(datastore, name)).toContain(message);
  });
});

describe("databaseNamesError", () => {
  it("names the first bad name", () => {
    expect(databaseNamesError("mysql", ["good", "bad name!", "ok"])).toContain(
      "bad name!",
    );
    expect(databaseNamesError("mysql", ["good", "ok"])).toBeNull();
  });
});

describe("userNameError", () => {
  it.each([
    ["mysql", "app"],
    ["mysql", "bad user"],
    ["postgresql", "reporting_user"],
  ])("accepts on %s: %s", (datastore, name) => {
    expect(userNameError(datastore, name)).toBeNull();
  });

  it.each([
    ["mysql", "a".repeat(17), "Use up to 16 characters"],
    ["mysql", "o'brien", "Use up to 16 characters"],
    ["mysql", " app", "Use up to 16 characters"],
    ["mysql", "root", "root is reserved"],
    ["postgresql", "a".repeat(64), "Use up to 63 characters"],
  ])("refuses on %s: %s", (datastore, name, message) => {
    expect(userNameError(datastore, name)).toContain(message);
  });
});

describe("passwordError", () => {
  it("asks for at least eight characters on every datastore", () => {
    expect(passwordError("postgresql", "x")).toBe("Use at least 8 characters");
    expect(passwordError("postgresql", "long enough")).toBeNull();
  });

  it("refuses the characters MySQL cannot take", () => {
    expect(passwordError("mysql", "pass;word")).toContain("none of");
    expect(passwordError("mysql", "pass-word")).toBeNull();
  });
});
