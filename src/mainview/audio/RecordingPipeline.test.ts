import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordingPipeline } from "./RecordingPipeline.js";

afterEach(() => vi.unstubAllGlobals());

describe("RecordingPipeline", () => {
  it("対象トラックのノードと port だけを解放し、残るトラックと AudioContext を継続する", async () => {
    const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
    const sources = [node(), node()] as const;
    const analysers = [node(), node()] as const;
    const gain = () => ({ ...node(), gain: { value: 1 } });
    const gains = [gain(), gain()] as const;
    const worklet = () => ({ ...node(), port: { onmessage: null as ((event: { data: ArrayBuffer }) => void) | null, close: vi.fn() }, addEventListener: vi.fn() });
    const worklets = [worklet(), worklet()] as const;
    const context = {
      state: "running", sampleRate: 48000, destination: {}, close: vi.fn(),
      audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
      createMediaStreamSource: vi.fn().mockReturnValueOnce(sources[0]).mockReturnValueOnce(sources[1]),
      createAnalyser: vi.fn().mockReturnValueOnce(analysers[0]).mockReturnValueOnce(analysers[1]),
      createGain: vi.fn().mockReturnValueOnce(gains[0]).mockReturnValueOnce(gains[1]),
    };
    let workletIndex = 0;
    vi.stubGlobal("AudioContext", class { constructor() { return context; } });
    vi.stubGlobal("AudioWorkletNode", class {
      constructor() {
        const instance = worklets[workletIndex++];
        if (!instance) throw new Error("Unexpected worklet");
        return instance;
      }
    });
    const pipeline = new RecordingPipeline();
    await pipeline.initialize(48000);
    const remainingPcm = vi.fn();
    pipeline.addTrack("mic", {} as MediaStream, 1, vi.fn());
    pipeline.addTrack("system", {} as MediaStream, 2, remainingPcm);
    pipeline.stopTrack("mic");
    pipeline.stopTrack("mic");
    expect(worklets[0].port.onmessage).toBeNull();
    expect(worklets[0].port.close).toHaveBeenCalledOnce();
    for (const n of [sources[0], analysers[0], gains[0], worklets[0]]) expect(n.disconnect).toHaveBeenCalledOnce();
    for (const n of [sources[1], analysers[1], gains[1], worklets[1]]) expect(n.disconnect).not.toHaveBeenCalled();
    expect(pipeline.getAnalyserForTrack("mic")).toBeNull();
    expect(pipeline.getAnalyserForTrack("system")).toBe(analysers[1]);
    worklets[1].port.onmessage?.({ data: new ArrayBuffer(4) });
    expect(remainingPcm).toHaveBeenCalledOnce();
    expect(context.close).not.toHaveBeenCalled();
    pipeline.stop();
    expect(worklets[1].port.close).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });
});
