// src/bun/services/NativeTranscription.test.ts
//
// NativeTranscription も NativeSystemAudioCapture と同じ理由（実サブプロセスの
// stdout/stderr を JSON 行プロトコルで解釈するロジックはモックでは検証できない）
// から、実行可能なスタブスクリプトを devPath（build/native/transcribe-audio）
// に配置し、実サブプロセスとして起動して確認する。
//
// findBinaryPath() は process.cwd() を基準にバイナリを探す非 export の
// モジュール内関数なので、直接は呼べない。各テストは process.chdir() で
// 隔離した一時ディレクトリに cwd を切り替え、isAvailable()/checkPermission()/
// transcribe() という export 済みの関数経由で間接的に検証する。
//
// toBcp47() も非 export のため直接テストできない。transcribe() に渡す
// language 引数がスタブスクリプトへどう届くかを確認することで間接的に
// カバーする。

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NativeTranscription from "./NativeTranscription.js";
import { withPlatform } from "./testHelpers/platformMock.js";

const BINARY_NAME = "transcribe-audio";

let tempDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "native-transcription-test-"),
  );
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

/** build/native/transcribe-audio としてスタブスクリプトを配置する。 */
function writeStub(script: string): void {
  const binDir = path.join(tempDir, "build", "native");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, BINARY_NAME), script, { mode: 0o755 });
}

describe("NativeTranscription.isAvailable", () => {
  it("is always false on non-darwin platforms, even with a binary present", () => {
    // isAvailable() は `process.platform === "darwin" && findBinaryPath() !== null`
    // という短絡評価なので、darwin 以外ではバイナリの有無を問わず false になる。
    // ホストの process.platform に頼らず明示的に linux へ固定し、macOS 開発機
    // での `pnpm test` でも同じ結果になるようにする。
    writeStub("#!/usr/bin/env bash\nexit 0\n");
    withPlatform("linux", () => {
      expect(NativeTranscription.isAvailable()).toBe(false);
    });
  });

  it("is true on darwin when the binary exists under build/native", () => {
    writeStub("#!/usr/bin/env bash\nexit 0\n");
    withPlatform("darwin", () => {
      expect(NativeTranscription.isAvailable()).toBe(true);
    });
  });

  it("is false on darwin when no binary or Swift source exists", () => {
    // 隔離した一時ディレクトリを cwd にしているため、
    // tryBuildFromSource() の srcPath (src/native/macos/transcribe-audio.swift)
    // も見つからず、swiftc は実行されない。
    withPlatform("darwin", () => {
      expect(NativeTranscription.isAvailable()).toBe(false);
    });
  });
});

describe("NativeTranscription.checkPermission", () => {
  it("resolves ok:true when the stub reports {check:ok}", async () => {
    writeStub('#!/usr/bin/env bash\necho \'{"check":"ok"}\' >&2\nexit 0\n');
    const result = await NativeTranscription.checkPermission();
    expect(result).toEqual({ ok: true });
  });

  it("resolves ok:false with reason and the stub's own hint on {check:error}", async () => {
    writeStub(
      '#!/usr/bin/env bash\necho \'{"check":"error","reason":"not authorized","hint":"Enable in Settings"}\' >&2\nexit 1\n',
    );
    const result = await NativeTranscription.checkPermission();
    expect(result).toEqual({
      ok: false,
      reason: "not authorized",
      hint: "Enable in Settings",
    });
  });

  it("falls back to the default hint when {check:error} omits hint", async () => {
    writeStub(
      '#!/usr/bin/env bash\necho \'{"check":"error","reason":"not authorized"}\' >&2\nexit 1\n',
    );
    const result = await NativeTranscription.checkPermission();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not authorized");
    expect(result.hint).toContain("Speech Recognition");
  });
});

describe("NativeTranscription.transcribe", () => {
  it("throws the reported reason when stderr contains an error", async () => {
    writeStub(
      '#!/usr/bin/env bash\necho \'{"error":"speech recognition unavailable"}\' >&2\nexit 1\n',
    );
    await expect(
      NativeTranscription.transcribe("/fake/audio.wav", "ja"),
    ).rejects.toThrow("speech recognition unavailable");
  });

  it("returns the trimmed stdout on success even when stderr is empty", async () => {
    writeStub("#!/usr/bin/env bash\nprintf '  hello world  \\n'\nexit 0\n");
    const result = await NativeTranscription.transcribe(
      "/fake/audio.wav",
      "en-US",
    );
    expect(result).toBe("hello world");
  });

  it("skips a non-JSON informational stderr line instead of throwing", async () => {
    writeStub(
      "#!/usr/bin/env bash\necho 'loading acoustic model...' >&2\nprintf 'hello world\\n'\nexit 0\n",
    );
    const result = await NativeTranscription.transcribe(
      "/fake/audio.wav",
      "en-US",
    );
    expect(result).toBe("hello world");
  });

  it("reports the exit code when the binary fails without a JSON error line", async () => {
    // 非 JSON 行は無条件でスキップされるため、stderr が非 JSON のみで
    // 終了コードが非ゼロの場合に到達するのはこの分岐だけになる。
    writeStub(
      "#!/usr/bin/env bash\necho 'unexpected crash' >&2\nexit 3\n",
    );
    await expect(
      NativeTranscription.transcribe("/fake/audio.wav", "en-US"),
    ).rejects.toThrow(/exit code: 3/);
  });

  it("converts an ISO 639-1 language code to BCP 47 before invoking the binary", async () => {
    // toBcp47() は非 export のため、スタブが受け取った argv をそのまま
    // stdout へ返すことで間接的に変換結果を確認する。
    writeStub(
      "#!/usr/bin/env bash\necho '{\"status\":\"ok\"}' >&2\necho \"$@\"\n",
    );
    const result = await NativeTranscription.transcribe(
      "/fake/audio.wav",
      "ja",
    );
    expect(result).toBe("/fake/audio.wav --language ja-JP");
  });

  it("passes an already-BCP47 language code through unchanged", async () => {
    writeStub(
      "#!/usr/bin/env bash\necho '{\"status\":\"ok\"}' >&2\necho \"$@\"\n",
    );
    const result = await NativeTranscription.transcribe(
      "/fake/audio.wav",
      "en-US",
    );
    expect(result).toBe("/fake/audio.wav --language en-US");
  });
});
