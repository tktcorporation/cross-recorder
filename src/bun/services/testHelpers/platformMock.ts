/**
 * NativeSystemAudioCapture / NativeTranscription のテストで共通に使う
 * process.platform の一時差し替え。ホストの実プラットフォームに依存する
 * テストを、どの OS 上の `pnpm test` でも同じ結果にするために使う。
 */
function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

/** 1 テストの間だけ platform を差し替え、終了後に元へ戻す。 */
export function withPlatform<T>(platform: NodeJS.Platform, fn: () => T): T {
  const original = process.platform;
  setPlatform(platform);
  try {
    return fn();
  } finally {
    setPlatform(original);
  }
}

/**
 * ファイル全体の beforeEach/afterEach で platform を固定するための対。
 * 呼び出し側が戻り値の originalPlatform を保持し、afterEach で
 * `restorePlatform(originalPlatform)` を呼ぶ。
 */
export function pinPlatform(platform: NodeJS.Platform): NodeJS.Platform {
  const original = process.platform;
  setPlatform(platform);
  return original;
}

export function restorePlatform(original: NodeJS.Platform): void {
  setPlatform(original);
}
