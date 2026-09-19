/**
 * NativeSystemAudioCapture / NativeTranscription のテストで共通に使う
 * process.platform の一時差し替え。ホストの実プラットフォームに依存する
 * テストを、どの OS 上の `pnpm test` でも同じ結果にするために使う。
 *
 * Node の process.platform は本来 writable:false の getter で定義されて
 * いる。復元時に固定の記述子（writable:true 等）で上書きすると、以後
 * そのプロセス内では本来と異なる書き込み可能なプロパティのまま残ってしまう
 * ため、差し替え前の記述子そのものを保存して復元する。
 */
function getPlatformDescriptor(): PropertyDescriptor {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  if (!descriptor) {
    throw new Error("process.platform has no own property descriptor");
  }
  return descriptor;
}

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

/** 1 テストの間だけ platform を差し替え、終了後に元の記述子へ戻す。 */
export function withPlatform<T>(platform: NodeJS.Platform, fn: () => T): T {
  const original = getPlatformDescriptor();
  setPlatform(platform);
  try {
    return fn();
  } finally {
    Object.defineProperty(process, "platform", original);
  }
}

/**
 * ファイル全体の beforeEach/afterEach で platform を固定するための対。
 * 呼び出し側が戻り値の記述子を保持し、afterEach で
 * `restorePlatform(originalDescriptor)` を呼ぶ。
 */
export function pinPlatform(platform: NodeJS.Platform): PropertyDescriptor {
  const original = getPlatformDescriptor();
  setPlatform(platform);
  return original;
}

export function restorePlatform(original: PropertyDescriptor): void {
  Object.defineProperty(process, "platform", original);
}
