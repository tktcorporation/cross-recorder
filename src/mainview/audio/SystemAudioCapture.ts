import { DEFAULT_SAMPLE_RATE } from "@shared/constants.js";

export class SystemAudioCapture {
  private stream: MediaStream | null = null;

  async start(): Promise<MediaStream> {
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      audio: {
        channelCount: 2,
        sampleRate: DEFAULT_SAMPLE_RATE,
      } as MediaTrackConstraints,
      video: false,
      systemAudio: "include",
    } as any);

    // Remove video tracks if present
    for (const track of this.stream.getVideoTracks()) {
      track.stop();
      this.stream.removeTrack(track);
    }

    return this.stream;
  }

  stop(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
  }
}
