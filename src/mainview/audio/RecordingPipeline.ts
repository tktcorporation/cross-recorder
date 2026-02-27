export class RecordingPipeline {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private onPcmData: ((data: ArrayBuffer) => void) | null = null;

  async initialize(sampleRate: number): Promise<void> {
    this.audioContext = new AudioContext({ sampleRate });
    const workletUrl = new URL(
      "./worklets/pcm-recorder.worklet.js",
      import.meta.url,
    ).href;
    await this.audioContext.audioWorklet.addModule(workletUrl);
  }

  start(options: {
    micStream?: MediaStream;
    systemStream?: MediaStream;
    onPcmData: (data: ArrayBuffer) => void;
  }): void {
    if (!this.audioContext) {
      throw new Error("RecordingPipeline not initialized");
    }

    this.onPcmData = options.onPcmData;

    const merger = this.audioContext.createChannelMerger(2);

    if (options.micStream) {
      const micSource = this.audioContext.createMediaStreamSource(
        options.micStream,
      );
      micSource.connect(merger, 0, 0);
    }

    if (options.systemStream) {
      const systemSource = this.audioContext.createMediaStreamSource(
        options.systemStream,
      );
      systemSource.connect(merger, 0, 1);
    }

    this.workletNode = new AudioWorkletNode(
      this.audioContext,
      "pcm-recorder",
    );

    this.workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      this.onPcmData?.(event.data);
    };

    merger.connect(this.workletNode);
    this.workletNode.connect(this.audioContext.destination);
  }

  stop(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.onPcmData = null;
  }

  getSampleRate(): number {
    if (!this.audioContext) {
      throw new Error("RecordingPipeline not initialized");
    }
    return this.audioContext.sampleRate;
  }
}
