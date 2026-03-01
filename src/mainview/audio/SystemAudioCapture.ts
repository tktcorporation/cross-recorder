export class SystemAudioCapture {
  private stream: MediaStream | null = null;
  private onTrackEndedCallback: (() => void) | null = null;
  private boundTrackEndedHandler: (() => void) | null = null;

  async start(): Promise<MediaStream> {
    // Use audio: true to avoid OverconstrainedError in CEF.
    // Specific constraints (echoCancellation etc.) are applied after acquisition.
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true,
      systemAudio: "include",
    } as DisplayMediaStreamOptions);

    // Disable video tracks — we only need audio, but stopping them
    // would terminate the display media session and kill audio tracks too.
    // They will be properly cleaned up when stop() is called.
    for (const track of this.stream.getVideoTracks()) {
      track.enabled = false;
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
      try {
        await track.applyConstraints({
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        });
      } catch {
        // Constraint application may fail in some CEF environments; continue
      }
    }

    // Listen for track ended events (e.g. display session terminated by OS)
    this.boundTrackEndedHandler = () => {
      this.onTrackEndedCallback?.();
    };
    for (const track of this.stream.getAudioTracks()) {
      track.addEventListener("ended", this.boundTrackEndedHandler);
    }
    // Video track ending also terminates the display session
    for (const track of this.stream.getVideoTracks()) {
      track.addEventListener("ended", this.boundTrackEndedHandler);
    }

    return this.stream;
  }

  onTrackEnded(callback: () => void): void {
    this.onTrackEndedCallback = callback;
  }

  stop(): void {
    if (this.stream) {
      // Remove event listeners before stopping
      if (this.boundTrackEndedHandler) {
        for (const track of this.stream.getTracks()) {
          track.removeEventListener("ended", this.boundTrackEndedHandler);
        }
        this.boundTrackEndedHandler = null;
      }
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    this.onTrackEndedCallback = null;
  }
}
