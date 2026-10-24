import { describe, expect, it } from "vitest";
import { assertRunStaysInActiveLibrary, RunRequestError } from "./run-request.js";

describe("active library run guard", () => {
  it("rejects a chat aimed at a library that is no longer active", () => {
    expect(() => assertRunStaysInActiveLibrary("demo", "personal")).toThrow(RunRequestError);
    try { assertRunStaysInActiveLibrary("demo", " personal "); }
    catch (error) { expect(error).toMatchObject({ statusCode: 409 }); }
  });

  it("allows the active library, an omitted id, and a frozen suggestion job", () => {
    expect(() => assertRunStaysInActiveLibrary("demo", "demo")).not.toThrow();
    expect(() => assertRunStaysInActiveLibrary("demo", "  ")).not.toThrow();
    expect(() => assertRunStaysInActiveLibrary("demo", undefined)).not.toThrow();
    expect(() => assertRunStaysInActiveLibrary("demo", "personal", "run-1")).not.toThrow();
  });
});
