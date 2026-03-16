export class SystemAudioCapture {
  private stream: MediaStream | null = null;
  private onTrackEndedCallback: (() => void) | null = null;
  private boundTrackEndedHandler: (() => void) | null = null;
  private sampleRate: number;
  private channels: number;

  /**
   * @param sampleRate AudioContext と一致させるサンプルレート。
   *   不一致だとブラウザ内部のリサンプラーが介入し、音声が歪む原因になる。
   *   Windows (WebView2) では特に注意が必要。
   * @param channels 取得するチャンネル数（通常 2 = ステレオ）。
   */
  constructor(sampleRate: number, channels: number) {
    this.sampleRate = sampleRate;
    this.channels = channels;
  }

  async start(): Promise<MediaStream> {
    // We only need audio, so try without video first to avoid
    // "NotReadableError: Could not start video source" errors.
    // Fall back to video: true for WebView environments that require it.
    this.stream = await this.acquireDisplayMedia();

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

    // Audio processing (noise suppression, echo cancellation, auto gain)
    // is disabled upfront in acquireDisplayMedia() via audio constraints.
    // No need for applyConstraints() here — that approach was unreliable.

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

  private async acquireDisplayMedia(): Promise<MediaStream> {
    // Disable all audio processing upfront so the browser never applies
    // noise suppression / echo cancellation / auto gain to system audio.
    // applyConstraints() after the fact is unreliable in some environments.
    // sampleRate と channelCount を明示的に指定し、AudioContext との
    // サンプルレート不一致を防ぐ。Windows (WebView2) ではシステムデバイスの
    // native レートがそのまま使われることがあり、内部リサンプラーの不具合で
    // 音声が歪む原因になる。
    const audioConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: this.sampleRate,
      channelCount: this.channels,
    };

    try {
      return await navigator.mediaDevices.getDisplayMedia({
        audio: audioConstraints,
        video: false,
        systemAudio: "include",
      } as DisplayMediaStreamOptions);
    } catch (err) {
      // User explicitly denied permission — do not retry
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        throw err;
      }
      // video: false may not be supported in some WebView environments;
      // fall back to video: true
      return await navigator.mediaDevices.getDisplayMedia({
        audio: audioConstraints,
        video: true,
        systemAudio: "include",
      } as DisplayMediaStreamOptions);
    }
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
