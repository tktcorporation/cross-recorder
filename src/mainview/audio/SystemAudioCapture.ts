import { DEFAULT_SAMPLE_RATE } from "@shared/constants.js";

export class SystemAudioCapture {
  private stream: MediaStream | null = null;

  async start(): Promise<MediaStream> {
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      audio: {
        channelCount: 2,
        sampleRate: DEFAULT_SAMPLE_RATE,
      } as MediaTrackConstraints,
      video: true,
      systemAudio: "include",
    } as DisplayMediaStreamOptions);

    // Remove video tracks — we only need audio
    for (const track of this.stream.getVideoTracks()) {
      track.stop();
      this.stream.removeTrack(track);
    }

    // Validate that audio tracks were actually captured
    if (this.stream.getAudioTracks().length === 0) {
      this.stop();
      throw new Error(
        "No audio tracks available. The selected source may not support system audio capture.",
      );
    }

    // Disable audio processing to capture raw system audio
    for (const track of this.stream.getAudioTracks()) {
      await track.applyConstraints({
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      });
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
