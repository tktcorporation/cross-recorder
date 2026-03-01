import type { TrackKind } from "@shared/types.js";

type TrackState = {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  worklet: AudioWorkletNode;
  silentGain: GainNode;
};

export class RecordingPipeline {
  private audioContext: AudioContext | null = null;
  private tracks = new Map<TrackKind, TrackState>();

  async initialize(sampleRate: number): Promise<void> {
    this.audioContext = new AudioContext({ sampleRate });
    // The AudioContext may be created in "suspended" state when the user
    // gesture chain is broken by an async gap (e.g. dynamic import).
    // Explicitly resume to ensure audio processing works.
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    const workletUrl = new URL(
      "./worklets/pcm-recorder.worklet.js",
      import.meta.url,
    ).href;
    await this.audioContext.audioWorklet.addModule(workletUrl);
  }

  addTrack(
    trackKind: TrackKind,
    stream: MediaStream,
    channels: number,
    onPcmData: (data: ArrayBuffer) => void,
  ): void {
    if (!this.audioContext) {
      throw new Error("RecordingPipeline not initialized");
    }

    const source = this.audioContext.createMediaStreamSource(stream);

    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 2048;

    const worklet = new AudioWorkletNode(
      this.audioContext,
      "pcm-recorder",
      {
        channelCount: channels,
        channelCountMode: "explicit",
        processorOptions: { channelCount: channels },
      },
    );

    worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      onPcmData(event.data);
    };

    // Silent gain to keep the audio graph active without audible output
    const silentGain = this.audioContext.createGain();
    silentGain.gain.value = 0;

    // Chain: source → analyser → worklet → silentGain → destination
    source.connect(analyser);
    analyser.connect(worklet);
    worklet.connect(silentGain);
    silentGain.connect(this.audioContext.destination);

    this.tracks.set(trackKind, { source, analyser, worklet, silentGain });
  }

  getAnalyserForTrack(trackKind: TrackKind): AnalyserNode | null {
    return this.tracks.get(trackKind)?.analyser ?? null;
  }

  stop(): void {
    for (const [, track] of this.tracks) {
      track.worklet.disconnect();
      track.analyser.disconnect();
      track.source.disconnect();
      track.silentGain.disconnect();
    }
    this.tracks.clear();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  getSampleRate(): number {
    if (!this.audioContext) {
      throw new Error("RecordingPipeline not initialized");
    }
    return this.audioContext.sampleRate;
  }
}
