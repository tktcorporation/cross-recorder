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
  it("書き込み境界で停止した後は PCM とレベル通知を配信しない", async () => {
    writeStub([
      "#!/usr/bin/env bash",
      "trap 'exit 0' TERM",
      'echo \'{"status":"started"}\' >&2',
      "while true; do printf '\\x00\\x20'; sleep 0.05; done",
    ].join("\n"));
    const capture = new NativeSystemAudioCapture();
    const chunks = vi.fn();
    const levels = vi.fn();
    let stopped: Promise<void> | undefined;
    await capture.start("capped-session", 10, (buffer) => {
      chunks(buffer);
      stopped = capture.stopIfActive("capped-session");
    }, levels);
    await vi.waitFor(() => expect(chunks).toHaveBeenCalledOnce());
    await stopped;
    expect(capture.isActive()).toBe(false);
    expect(chunks).toHaveBeenCalledOnce();
    expect(levels).not.toHaveBeenCalled();
  });

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

describe("NativeSystemAudioCapture receipt lifecycle", () => {
  it("開いた stdout の無受信は助言だけを通知し、再開したゼロ PCM をそのまま保存する", async () => {
    writeStub([
      "#!/usr/bin/env bash",
      "trap 'exit 0' TERM",
      'echo \'{"status":"started"}\' >&2',
      "while [ ! -f resume ]; do sleep 0.01; done",
      "printf '\\x00\\x00\\x00\\x00'",
      "while true; do sleep 0.05; done",
    ].join("\n"));
    const capture = new NativeSystemAudioCapture();
    const chunks: Buffer[] = [];
    const states = vi.fn();
    const errors = vi.fn();
    const clock = vi.spyOn(performance, "now").mockReturnValue(100);
    const interval = vi.spyOn(globalThis, "setInterval");
    try {
      await capture.start("quiet", 48000, (bytes) => chunks.push(bytes), undefined, errors, states);
      const check = interval.mock.calls.at(-1)?.[0];
      expect(interval.mock.calls.at(-1)?.[1]).toBe(1000);
      expect(typeof check).toBe("function");
      clock.mockReturnValue(10_100);
      if (typeof check === "function") check();
      if (typeof check === "function") check();
      expect(states.mock.calls).toEqual([["gap"]]);
      expect(errors).not.toHaveBeenCalled();
      fs.writeFileSync("resume", "");
      await vi.waitFor(() => expect(chunks).toHaveLength(1));
      expect(Buffer.concat(chunks)).toEqual(Buffer.alloc(4));
      expect(states.mock.calls).toEqual([["gap"], ["receiving"]]);
      clock.mockReturnValue(20_099);
      if (typeof check === "function") check();
      expect(states).toHaveBeenCalledTimes(2);
      await capture.stop();
      clock.mockReturnValue(30_100);
      if (typeof check === "function") check();
      expect(states).toHaveBeenCalledTimes(2);
    } finally {
      await capture.stop();
      clock.mockRestore();
      interval.mockRestore();
    }
  });

  it("予期しない stdout EOF はバッファを保存した後に一度エラー通知する", async () => {
    writeStub('#!/usr/bin/env bash\necho \'{"status":"started"}\' >&2\nprintf \'\\x00\\x20\\x00\\x00\'\n');
    const events: string[] = [];
    const capture = new NativeSystemAudioCapture();
    await capture.start("eof", 48000, (bytes) => events.push(bytes.toString("hex")), undefined, (reason) => events.push(reason));
    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(events[0]).toBe("00200000");
    expect(events[1]).toContain("stdout");
    await capture.stop();
  });

  it("開始前の EOF は所有状態を解放して次の開始を許可する", async () => {
    writeStub("#!/usr/bin/env bash\nexit 1\n");
    const capture = new NativeSystemAudioCapture();
    await expect(capture.start("failed", 48000, () => {})).rejects.toThrow();
    expect(capture.isActive()).toBe(false);
    writeStub('#!/usr/bin/env bash\necho \'{"status":"started"}\' >&2\nsleep 0.1\n');
    await capture.start("next", 48000, () => {});
    await capture.stop();
  });
});

describe("NativeSystemAudioCapture producer ownership", () => {
  it("停止中の古い開始失敗は同じsessionIdの新しいキャプチャを解除しない", async () => {
    writeStub("#!/usr/bin/env bash\nsleep 1\n");
    const capture = new NativeSystemAudioCapture();
    const oldStart = capture.start("same", 48000, () => {});
    const rejected = expect(oldStart).rejects.toThrow(/stopped|exited/);
    const oldStop = capture.stop();
    writeStub('#!/usr/bin/env bash\necho \'{"status":"started"}\' >&2\nsleep 1\n');
    await capture.start("same", 48000, () => {});
    await rejected;
    await oldStop;
    expect(capture.isActive("same")).toBe(true);
    await capture.stop();
  });

  it("停止後に再開した同じsessionIdへ古いタイマーやreaderの通知を送らない", async () => {
    writeStub('#!/usr/bin/env bash\necho \'{"status":"started"}\' >&2\nsleep 0.2\necho \'{"error":"old failure"}\' >&2\nprintf \'\\x00\\x20\'\n');
    const capture = new NativeSystemAudioCapture();
    const oldChunks = vi.fn();
    const oldErrors = vi.fn();
    const oldStates = vi.fn();
    const intervals = vi.spyOn(globalThis, "setInterval");
    const cleared = vi.spyOn(globalThis, "clearInterval");
    const clock = vi.spyOn(performance, "now").mockReturnValue(100);
    try {
      await capture.start("same", 48000, oldChunks, undefined, oldErrors, oldStates);
      const oldCheck = intervals.mock.calls.at(-1)?.[0];
      const oldTimer = intervals.mock.results.at(-1)?.value;
      await capture.stop();
      expect(cleared).toHaveBeenCalledWith(oldTimer);
      writeStub('#!/usr/bin/env bash\necho \'{"status":"started"}\' >&2\nsleep 1\n');
      await capture.start("same", 48000, () => {});
      clock.mockReturnValue(10_100);
      if (typeof oldCheck === "function") oldCheck();
      expect(oldStates).not.toHaveBeenCalled();
      expect(oldErrors).not.toHaveBeenCalled();
      expect(oldChunks).not.toHaveBeenCalled();
    } finally {
      await capture.stop();
      intervals.mockRestore();
      cleared.mockRestore();
      clock.mockRestore();
    }
  });

  it("起動タイムアウトはプロセスと所有状態を解放する", async () => {
    writeStub("#!/usr/bin/env bash\nsleep 1\n");
    const capture = new NativeSystemAudioCapture();
    const timers = vi.spyOn(globalThis, "setTimeout");
    const cleared = vi.spyOn(globalThis, "clearTimeout");
    try {
      const starting = capture.start("timeout", 48000, () => {});
      const rejected = expect(starting).rejects.toThrow(/Timeout/);
      const expire = timers.mock.calls.find((call) => call[1] === 10_000)?.[0];
      expect(typeof expire).toBe("function");
      if (typeof expire === "function") expire();
      await rejected;
      expect(cleared).toHaveBeenCalled();
      expect(capture.isActive()).toBe(false);
    } finally {
      await capture.stop();
      timers.mockRestore();
      cleared.mockRestore();
    }
  });
});

describe("NativeSystemAudioCapture stdout failures", () => {
  it("stdout読み取り失敗は保存済みPCMの後に通知し、通知失敗をログに残す", async () => {
    writeStub("#!/usr/bin/env bash\n");
    let reads = 0;
    const stdout = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (reads++ === 0) controller.enqueue(new Uint8Array([0, 32]));
        else controller.error(new Error("stdout read failed"));
      },
    });
    const stderr = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"status":"started"}\n'));
      },
    });
    // Subprocess boundary double: the OS cannot deterministically inject a pipe read failure.
    const spawned = vi.spyOn(Bun, "spawn").mockReturnValueOnce({
      stdout, stderr, kill: vi.fn(), exited: Promise.resolve(0), exitCode: 0,
    } as unknown as ReturnType<typeof Bun.spawn>);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const events: string[] = [];
    const cleared = vi.spyOn(globalThis, "clearInterval");
    const capture = new NativeSystemAudioCapture();
    try {
      await capture.start("broken-pipe", 48000, (bytes) => events.push(bytes.toString("hex")), undefined, (reason) => {
        events.push(reason);
        throw new Error("notification failed");
      });
      await vi.waitFor(() => expect(log).toHaveBeenCalled());
      expect(events).toEqual(["0020", "stdout read failed"]);
      expect(cleared).toHaveBeenCalled();
    } finally {
      await capture.stop();
      spawned.mockRestore();
      log.mockRestore();
      cleared.mockRestore();
    }
  });

  it("ネイティブエラーの後もstdoutの保留PCMを保存しEOF通知を重複しない", async () => {
    writeStub('#!/usr/bin/env bash\nprintf \'{"status":"started"}\\n{"error":"native failed"}\\n\' >&2\nprintf \'\\x00\\x00\\x00\\x20\'\n');
    const capture = new NativeSystemAudioCapture();
    const chunks: Buffer[] = [];
    const errors = vi.fn();
    await capture.start("native-error", 48000, (bytes) => chunks.push(bytes), undefined, errors);
    await vi.waitFor(() => expect(chunks).toHaveLength(1));
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([0, 0, 0, 32]));
    expect(errors.mock.calls).toEqual([["native failed"]]);
    await capture.stop();
  });
});

describe("NativeSystemAudioCapture terminal notification", () => {
  it("ネイティブエラー通知が失敗した場合はEOFで終了を再度通知する", async () => {
    writeStub('#!/usr/bin/env bash\nprintf \'{"status":"started"}\\n{"error":"native failed"}\\n\' >&2\n');
    const errors: string[] = [];
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const capture = new NativeSystemAudioCapture();
    try {
      await capture.start("failed-notification", 48000, () => {}, undefined, (reason) => {
        errors.push(reason);
        if (reason === "native failed") throw new Error("notification failed");
      });
      await vi.waitFor(() => expect(errors).toHaveLength(2));
      expect(errors[0]).toBe("native failed");
      expect(errors[1]).toContain("stdout");
      expect(log).toHaveBeenCalledOnce();
    } finally {
      await capture.stop();
      log.mockRestore();
    }
  });

  it("通常停止ではstdoutの終了をエラー扱いせず起動と停止のタイマーを解除する", async () => {
    writeStub('#!/usr/bin/env bash\necho \'{"status":"started"}\' >&2\nsleep 1\n');
    const capture = new NativeSystemAudioCapture();
    const errors = vi.fn();
    const timers = vi.spyOn(globalThis, "setTimeout");
    const cleared = vi.spyOn(globalThis, "clearTimeout");
    try {
      await capture.start("normal-stop", 48000, () => {}, undefined, errors);
      const startupIndex = timers.mock.calls.findIndex((call) => call[1] === 10_000);
      expect(startupIndex).toBeGreaterThanOrEqual(0);
      expect(cleared).toHaveBeenCalledWith(timers.mock.results[startupIndex]?.value);
      await capture.stop();
      const stopIndex = timers.mock.calls.findIndex((call) => call[1] === 3000);
      expect(stopIndex).toBeGreaterThanOrEqual(0);
      expect(cleared).toHaveBeenCalledWith(timers.mock.results[stopIndex]?.value);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      await capture.stop();
      timers.mockRestore();
      cleared.mockRestore();
    }
  });
});
