// src/bun/services/NativeSystemAudioCapture.test.ts
//
// NativeSystemAudioCapture の全パブリック API は内部で Bun.spawn を使い、
// 実サブプロセスの stdout/stderr を JSON 行プロトコルで解釈する。モックでは
// この解釈ロジック（行分割・非 JSON 行のスキップ・プロセス終了と
// SIGTERM/SIGKILL の挙動）を検証できないため、ここでは実行可能なスタブ
// スクリプトをプラットフォーム用バイナリの探索パス
// （build/native/capture-system-audio.sh）に配置し、実サブプロセスとして
// 起動して確認する。
//
// findBinaryPath() は process.cwd() を基準にバイナリを探す private static
// メソッドなので、直接は呼べない。各テストは process.chdir() で隔離した
// 一時ディレクトリに cwd を切り替え、isAvailable()/checkPermission()/start()
// という public API 経由で間接的に検証する。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { NativeSystemAudioCapture } from "./NativeSystemAudioCapture.js";
import { pinPlatform, restorePlatform, withPlatform } from "./testHelpers/platformMock.js";

// PLATFORM_CONFIGS の linux エントリがバイナリ名 capture-system-audio.sh を
// 決める。ホストの process.platform が既に linux とは限らない（例: macOS
// 開発機での `pnpm test`）ため、各テストの前後で明示的に linux へ固定する。
const LINUX_BINARY_NAME = "capture-system-audio.sh";

let tempDir: string;
let originalCwd: string;
let originalHostPlatform: PropertyDescriptor;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "native-system-audio-capture-test-"),
  );
  process.chdir(tempDir);

  originalHostPlatform = pinPlatform("linux");
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });

  restorePlatform(originalHostPlatform);
});

/**
 * build/native/capture-system-audio.sh としてスタブスクリプトを配置する。
 * findBinaryPath() の devPath 探索（process.cwd()/build/native/<binaryName>）
 * に一致させるため、常にこのパスへ書く。
 */
function writeStub(script: string): void {
  const binDir = path.join(tempDir, "build", "native");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, LINUX_BINARY_NAME), script, {
    mode: 0o755,
  });
}

describe("NativeSystemAudioCapture.isAvailable", () => {
  it("returns true when the platform binary exists under build/native", () => {
    writeStub("#!/usr/bin/env bash\nexit 0\n");
    expect(NativeSystemAudioCapture.isAvailable()).toBe(true);
  });

  it("returns false on a platform with no capture config", () => {
    withPlatform("win32", () => {
      expect(NativeSystemAudioCapture.isAvailable()).toBe(false);
    });
  });

  it("returns false on a supported platform when no binary exists anywhere", () => {
    expect(NativeSystemAudioCapture.isAvailable()).toBe(false);
  });
});

describe("NativeSystemAudioCapture.checkPermission", () => {
  it("resolves ok:true when the stub reports {check:ok}", async () => {
    writeStub('#!/usr/bin/env bash\necho \'{"check":"ok"}\' >&2\nexit 0\n');
    const result = await NativeSystemAudioCapture.checkPermission();
    expect(result).toEqual({ ok: true });
  });

  it("resolves ok:false with reason and hint when the stub reports {check:error}", async () => {
    writeStub(
      '#!/usr/bin/env bash\necho \'{"check":"error","reason":"no backend"}\' >&2\nexit 1\n',
    );
    const result = await NativeSystemAudioCapture.checkPermission();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no backend");
    expect(result.hint).toContain("PipeWire");
  });

  it("skips non-JSON stderr lines and still finds the trailing JSON check line", async () => {
    writeStub(
      [
        "#!/usr/bin/env bash",
        "echo 'starting up...' >&2",
        "echo 'probing backend' >&2",
        'echo \'{"check":"ok"}\' >&2',
        "exit 0",
      ].join("\n"),
    );
    const result = await NativeSystemAudioCapture.checkPermission();
    expect(result).toEqual({ ok: true });
  });

  it("falls back to an exit-code message when stderr has no parseable JSON at all", async () => {
    writeStub(
      "#!/usr/bin/env bash\necho 'unexpected native failure' >&2\nexit 3\n",
    );
    const result = await NativeSystemAudioCapture.checkPermission();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Preflight check failed (exit code: 3)");
    expect(result.hint).toContain("PipeWire");
  });
});

describe("NativeSystemAudioCapture#start", () => {
  it("resolves when the first stderr message is {status:started}", async () => {
    writeStub('#!/usr/bin/env bash\necho \'{"status":"started"}\' >&2\n');
    const capture = new NativeSystemAudioCapture();
    await expect(
      capture.start("session-1", 48000, () => {}),
    ).resolves.toBeUndefined();
  });

  it("rejects with the reported reason when the first message is an error", async () => {
    writeStub(
      '#!/usr/bin/env bash\necho \'{"error":"permission denied"}\' >&2\nexit 1\n',
    );
    const capture = new NativeSystemAudioCapture();
    await expect(capture.start("session-1", 48000, () => {})).rejects.toThrow(
      "permission denied",
    );
  });

  it("rejects when the first message is neither started nor an error", async () => {
    writeStub('#!/usr/bin/env bash\necho \'{"status":"weird"}\' >&2\nexit 1\n');
    const capture = new NativeSystemAudioCapture();
    await expect(capture.start("session-1", 48000, () => {})).rejects.toThrow(
      /Unexpected native capture status/,
    );
  });

  it("streams PCM bytes to writeChunk and reports an RMS level within [0,1]", async () => {
    // sampleRate=10 で levelReportInterval = floor(10/10) = 1 サンプルとなり、
    // 1 サンプル (2 バイト) 書くだけで onLevel が発火する。
    // 0x2000 (8192) は正規化すると 0.25 になり、level = min(1, rms*2) = 0.5。
    writeStub(
      [
        "#!/usr/bin/env bash",
        'echo \'{"status":"started"}\' >&2',
        "printf '\\x00\\x20'",
      ].join("\n"),
    );

    const chunks: Buffer[] = [];
    const levels: number[] = [];
    const capture = new NativeSystemAudioCapture();

    await capture.start(
      "session-1",
      10,
      (buf) => chunks.push(Buffer.from(buf)),
      (level) => levels.push(level),
    );

    await vi.waitFor(
      () => {
        expect(levels.length).toBeGreaterThan(0);
      },
      { timeout: 2000 },
    );

    expect(Buffer.concat(chunks)).toEqual(Buffer.from([0x00, 0x20]));
    for (const level of levels) {
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
    expect(levels[0]).toBeCloseTo(0.5, 5);
  });

  it("delivers error lines reported after startup via onError, and keeps reading after onError throws", async () => {
    writeStub(
      [
        "#!/usr/bin/env bash",
        'echo \'{"status":"started"}\' >&2',
        "echo 'probing backend...' >&2",
        'echo \'{"error":"first failure"}\' >&2',
        "sleep 0.1",
        'echo \'{"error":"second failure"}\' >&2',
        "sleep 0.5",
      ].join("\n"),
    );

    const errors: string[] = [];
    const capture = new NativeSystemAudioCapture();
    await capture.start("session-1", 48000, () => {}, undefined, (reason) => {
      errors.push(reason);
      // onError 自体が失敗しても（例: RPC 送信エラー）、readStderrLoop が
      // 後続の "second failure" を配信し続けることを確認するため、
      // わざと throw する。
      throw new Error("onError callback itself is failing on purpose");
    });

    await vi.waitFor(
      () => {
        expect(errors).toEqual(["first failure", "second failure"]);
      },
      { timeout: 2000 },
    );

    await capture.stop();
  });

  it("keeps reading after a stderr line that parses to a non-object JSON value", async () => {
    // JSON.parse("null") は成功して null を返す。msg.error への素朴な
    // アクセスはその場合に投げ、対策前は外側の catch がループごと終了させて
    // いたため、後続のエラー行が届かなくなっていた。
    writeStub(
      [
        "#!/usr/bin/env bash",
        'echo \'{"status":"started"}\' >&2',
        "echo 'null' >&2",
        'echo \'{"error":"reported after a null line"}\' >&2',
        "sleep 0.5",
      ].join("\n"),
    );

    const errors: string[] = [];
    const capture = new NativeSystemAudioCapture();
    await capture.start(
      "session-1",
      48000,
      () => {},
      undefined,
      (reason) => errors.push(reason),
    );

    await vi.waitFor(
      () => {
        expect(errors).toEqual(["reported after a null line"]);
      },
      { timeout: 2000 },
    );

    await capture.stop();
  });
});

describe("NativeSystemAudioCapture#stop", () => {
  it("terminates a SIGTERM-responsive process quickly", async () => {
    writeStub(
      [
        "#!/usr/bin/env bash",
        "trap 'exit 0' TERM",
        'echo \'{"status":"started"}\' >&2',
        "while true; do sleep 0.05; done",
      ].join("\n"),
    );

    const capture = new NativeSystemAudioCapture();
    await capture.start("session-1", 48000, () => {});

    const startedAt = Date.now();
    await capture.stop();
    const elapsedMs = Date.now() - startedAt;

    // stop() 内部の SIGKILL フォールバックは 3 秒待ってから発動するため、
    // それより十分短ければ SIGTERM だけで正常終了したと判定できる。
    expect(elapsedMs).toBeLessThan(1500);
  });

  it("falls back to SIGKILL after the internal 3s timeout when SIGTERM is ignored", async () => {
    const pidFile = path.join(tempDir, "child.pid");
    writeStub(
      [
        "#!/usr/bin/env bash",
        "trap '' TERM",
        `echo $$ > "${pidFile}"`,
        'echo \'{"status":"started"}\' >&2',
        "while true; do sleep 0.05; done",
      ].join("\n"),
    );

    const capture = new NativeSystemAudioCapture();
    await capture.start("session-1", 48000, () => {});
    const childPid = Number(fs.readFileSync(pidFile, "utf8").trim());

    const startedAt = Date.now();
    await capture.stop();
    const elapsedMs = Date.now() - startedAt;

    // SIGTERM を無視するプロセスなので、stop() は必ず内部タイムアウト
    // (3000ms) を経由してから SIGKILL にフォールバックする。この所要時間
    // をもって SIGKILL 経路を通ったことの証拠とする。
    expect(elapsedMs).toBeGreaterThanOrEqual(2900);

    // 経過時間だけでは「タイムアウトを待っただけ」でも green になるため、
    // process.kill(pid, 0) でシグナルを送らず存在確認だけ行い、SIGKILL が
    // 実際にプロセスへ届いて消滅したことも確認する（対象が無ければ ESRCH）。
    // stop() は SIGKILL 送信後にプロセスの終了を待たずに返るため、シグナルが
    // 反映され OS がプロセステーブルから取り除くまでには短い猶予がありうる。
    await vi.waitFor(
      () => {
        expect(() => process.kill(childPid, 0)).toThrow(
          expect.objectContaining({ code: "ESRCH" }),
        );
      },
      { timeout: 1000 },
    );
  }, 8000);
});
