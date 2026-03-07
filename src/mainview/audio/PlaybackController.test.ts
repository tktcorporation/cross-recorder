import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlaybackController } from "./PlaybackController.js";

// --- Minimal Web Audio API mocks ---

function createMockSourceNode() {
  return {
    buffer: null as AudioBuffer | null,
    onended: null as (() => void) | null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function createMockAudioContext(currentTime = 0) {
  const sources: ReturnType<typeof createMockSourceNode>[] = [];
  let time = currentTime;
  return {
    get currentTime() {
      return time;
    },
    set _currentTime(t: number) {
      time = t;
    },
    state: "running" as AudioContextState,
    destination: {} as AudioDestinationNode,
    resume: vi.fn(),
    createBufferSource: vi.fn(() => {
      const node = createMockSourceNode();
      sources.push(node);
      return node as unknown as AudioBufferSourceNode;
    }),
    close: vi.fn(),
    _sources: sources,
    _advanceTime(seconds: number) {
      time += seconds;
    },
  };
}

function createMockBuffer(duration: number, channels = 1): AudioBuffer {
  return { duration, numberOfChannels: channels } as AudioBuffer;
}

describe("PlaybackController", () => {
  let ctx: ReturnType<typeof createMockAudioContext>;

  beforeEach(() => {
    ctx = createMockAudioContext(0);
  });

  it("reports correct duration from the longest buffer", () => {
    const buffers = [createMockBuffer(3), createMockBuffer(5)];
    const ctrl = new PlaybackController(
      ctx as unknown as AudioContext,
      buffers,
    );
    expect(ctrl.duration).toBe(5);
  });

  it("reports 0 duration for empty buffer list", () => {
    const ctrl = new PlaybackController(
      ctx as unknown as AudioContext,
      [],
    );
    expect(ctrl.duration).toBe(0);
  });

  it("starts in non-playing state", () => {
    const ctrl = new PlaybackController(
      ctx as unknown as AudioContext,
      [createMockBuffer(5)],
    );
    expect(ctrl.playing).toBe(false);
    expect(ctrl.currentTime).toBe(0);
  });

  it("play() creates source nodes and starts them", () => {
    const buffers = [createMockBuffer(3), createMockBuffer(5)];
    const ctrl = new PlaybackController(
      ctx as unknown as AudioContext,
      buffers,
    );

    ctrl.play(0);

    expect(ctx.createBufferSource).toHaveBeenCalledTimes(2);
    expect(ctx._sources[0]!.start).toHaveBeenCalledWith(0, 0);
    expect(ctx._sources[1]!.start).toHaveBeenCalledWith(0, 0);
    expect(ctrl.playing).toBe(true);
  });

  it("play() with offset starts from that position", () => {
    const ctrl = new PlaybackController(
      ctx as unknown as AudioContext,
      [createMockBuffer(10)],
    );

    ctrl.play(3.5);

    expect(ctx._sources[0]!.start).toHaveBeenCalledWith(0, 3.5);
  });

  it("pause() preserves current position", () => {
    const ctrl = new PlaybackController(
      ctx as unknown as AudioContext,
      [createMockBuffer(10)],
    );

    ctrl.play(0);
    ctx._advanceTime(2.5);
    ctrl.pause();

    expect(ctrl.playing).toBe(false);
    expect(ctrl.currentTime).toBeCloseTo(2.5);
  });

  it("resume after pause continues from paused position", () => {
    const ctrl = new PlaybackController(
      ctx as unknown as AudioContext,
      [createMockBuffer(10)],
    );

    ctrl.play(0);
    ctx._advanceTime(2);
    ctrl.pause();

    // Clear previous sources
    ctx._sources.length = 0;
    ctrl.play();

    // Should start from the paused offset (~2 seconds)
    expect(ctx._sources[0]!.start).toHaveBeenCalledWith(0, expect.closeTo(2));
  });

  it("seek while playing restarts from new position", () => {
    const ctrl = new PlaybackController(
      ctx as unknown as AudioContext,
      [createMockBuffer(10)],
    );

    ctrl.play(0);
    const firstSource = ctx._sources[0]!;

    ctx._advanceTime(1);
    ctrl.seek(5);

    // Old source should be stopped
    expect(firstSource.stop).toHaveBeenCalled();
    // New source should start at seek position
    const newSource = ctx._sources[ctx._sources.length - 1]!;
    expect(newSource.start).toHaveBeenCalledWith(0, 5);
    expect(ctrl.playing).toBe(true);
  });

  it("seek while paused updates offset without playing", () => {
    const ctrl = new PlaybackController(
      ctx as unknown as AudioContext,
      [createMockBuffer(10)],
    );

    ctrl.play(0);
    ctrl.pause();
    ctrl.seek(7);

    expect(ctrl.playing).toBe(false);
    expect(ctrl.currentTime).toBe(7);
  });

  it("seek clamps to [0, duration]", () => {
    const ctrl = new PlaybackController(
      ctx as unknown as AudioContext,
      [createMockBuffer(5)],
    );

    ctrl.seek(-1);
    expect(ctrl.currentTime).toBe(0);

    ctrl.seek(100);
    expect(ctrl.currentTime).toBe(5);
  });

  it("onended fires when the longest track finishes naturally", () => {
    const buffers = [createMockBuffer(3), createMockBuffer(5)];
    const ctrl = new PlaybackController(
      ctx as unknown as AudioContext,
      buffers,
    );

    const onEnded = vi.fn();
    ctrl.onEnded = onEnded;
    ctrl.play(0);

    // The longest buffer is index 1 (5 seconds)
    const longestSource = ctx._sources[1]!;
    expect(longestSource.onended).not.toBeNull();

    // Simulate natural end
    longestSource.onended!();

    expect(onEnded).toHaveBeenCalledOnce();
    expect(ctrl.playing).toBe(false);
  });

  it("stale onended from old generation is ignored (seek safety)", () => {
    const ctrl = new PlaybackController(
      ctx as unknown as AudioContext,
      [createMockBuffer(10)],
    );

    const onEnded = vi.fn();
    ctrl.onEnded = onEnded;
    ctrl.play(0);

    // Capture the onended from the first play
    const firstOnEnded = ctx._sources[0]!.onended;

    // Seek creates new sources, incrementing generation
    ctrl.seek(5);

    // The old onended should be nulled out by destroySources,
    // but even if it were somehow called, it should be a no-op
    // due to generation mismatch
    if (firstOnEnded) {
      firstOnEnded();
    }

    expect(onEnded).not.toHaveBeenCalled();
    expect(ctrl.playing).toBe(true);
  });

  it("dispose() stops all sources and clears callback", () => {
    const ctrl = new PlaybackController(
      ctx as unknown as AudioContext,
      [createMockBuffer(5)],
    );

    ctrl.onEnded = vi.fn();
    ctrl.play(0);
    ctrl.dispose();

    expect(ctx._sources[0]!.stop).toHaveBeenCalled();
    expect(ctrl.onEnded).toBeNull();
  });

  it("currentTime does not exceed duration", () => {
    const ctrl = new PlaybackController(
      ctx as unknown as AudioContext,
      [createMockBuffer(3)],
    );

    ctrl.play(0);
    ctx._advanceTime(100); // far past duration

    expect(ctrl.currentTime).toBe(3);
  });
});
