import { Effect } from "effect";

export type RpcSuccess<A> = { readonly success: true; readonly data: A };
export type RpcError = {
  readonly success: false;
  readonly error: { readonly _tag: string; readonly message: string };
};
export type RpcResult<A> = RpcSuccess<A> | RpcError;

export function runRpcEffect<A, E extends { _tag: string }>(
  effect: Effect.Effect<A, E>,
): Promise<RpcResult<A>> {
  return Effect.runPromise(
    effect.pipe(
      Effect.map((data): RpcResult<A> => ({ success: true, data })),
      Effect.catchAll((e) =>
        Effect.succeed<RpcResult<A>>({
          success: false,
          error: { _tag: e._tag, message: JSON.stringify(e) },
        }),
      ),
    ),
  );
}
