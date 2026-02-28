import { describe, it, expect } from "vitest";
import { Effect, Data } from "effect";
import { runRpcEffect } from "./rpc-result.js";

class TestError extends Data.TaggedError("TestError")<{
  readonly reason: string;
}> {}

describe("runRpcEffect", () => {
  it("returns success result on success", async () => {
    const effect = Effect.succeed({ value: 42 });
    const result = await runRpcEffect(effect);
    expect(result).toEqual({ success: true, data: { value: 42 } });
  });

  it("returns error result on failure", async () => {
    const effect = Effect.fail(new TestError({ reason: "boom" }));
    const result = await runRpcEffect(effect);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error._tag).toBe("TestError");
      expect(result.error.message).toContain("boom");
    }
  });
});
