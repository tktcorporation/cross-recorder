import type { AudioDevice } from "@shared/types.js";
import { DEFAULT_SAMPLE_RATE } from "@shared/constants.js";
import { TrackEndedWatcher } from "./TrackEndedWatcher.js";

export class MicrophoneCapture {
  private stream: MediaStream | null = null;
  private readonly trackEndedWatcher = new TrackEndedWatcher();

  async start(deviceId?: string): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: DEFAULT_SAMPLE_RATE,
        channelCount: 1,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);

    // Validate that an audio track was actually captured (the device may
    // have been disconnected in the window between permission grant and
    // track creation).
    if (this.stream.getAudioTracks().length === 0) {
      this.stop();
      throw new Error(
        "No audio tracks available. The selected microphone may have been disconnected.",
      );
    }

    // Listen for track ended events (e.g. device unplugged, OS revokes access)
    this.trackEndedWatcher.attach(this.stream.getAudioTracks());

    return this.stream;
  }

  onTrackEnded(callback: () => void): void {
    this.trackEndedWatcher.onEnded(callback);
  }

  stop(): void {
    if (this.stream) {
      this.trackEndedWatcher.detach(this.stream.getTracks());
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
  }

  static async enumerateDevices(): Promise<AudioDevice[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audioinput")
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone (${d.deviceId.slice(0, 8)})`,
        kind: "audioinput" as const,
        isDefault: d.deviceId === "default",
      }));
  }
}
