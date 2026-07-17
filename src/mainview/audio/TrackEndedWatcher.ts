/**
 * MediaStreamTrack の "ended" イベント監視ライフサイクルを共通化する。
 *
 * 背景: マイク・システム音声のどちらのキャプチャも「デバイス切断/権限失効で
 * トラックが終了したら呼び出し元に通知し、stop() 時にはリスナーを確実に
 * 外してからトラックを止める」という同じ手順を必要とする。片方だけ修正して
 * 挙動がずれることを防ぐため、この手順を単一の実装に集約している。
 */
export class TrackEndedWatcher {
  private callback: (() => void) | null = null;
  private boundHandler: (() => void) | null = null;

  onEnded(callback: () => void): void {
    this.callback = callback;
  }

  attach(tracks: MediaStreamTrack[]): void {
    this.boundHandler = () => {
      this.callback?.();
    };
    for (const track of tracks) {
      track.addEventListener("ended", this.boundHandler);
    }
  }

  detach(tracks: MediaStreamTrack[]): void {
    if (this.boundHandler) {
      for (const track of tracks) {
        track.removeEventListener("ended", this.boundHandler);
      }
      this.boundHandler = null;
    }
    this.callback = null;
  }
}
