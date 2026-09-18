import { describe, it, expect } from "vitest";
import { omitNullishEntries } from "./utils.js";

describe("omitNullishEntries", () => {
  it("keeps entries whose value is defined and non-null", () => {
    expect(omitNullishEntries({ a: 1, b: "x", c: false })).toEqual({
      a: 1,
      b: "x",
      c: false,
    });
  });

  it("drops entries whose value is undefined", () => {
    expect(omitNullishEntries({ a: 1, b: undefined })).toEqual({ a: 1 });
  });

  it("drops entries whose value is null", () => {
    expect(omitNullishEntries({ a: 1, b: null })).toEqual({ a: 1 });
  });

  it("returns an empty object when every value is nullish", () => {
    expect(omitNullishEntries({ a: undefined, b: null })).toEqual({});
  });
});
