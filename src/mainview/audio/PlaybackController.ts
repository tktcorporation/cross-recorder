// src/mainview/audio/PlaybackController.ts

/**
 * AudioBufferSourceNode のライフサイクルを管理するマルチトラック再生コントローラー。
 *
 * 背景: AudioBufferSourceNode は使い捨て — stop() 後は再利用できない。
 * play/seek のたびに新しいノードを生成し、古いノードの onended が
 * 誤発火しないよう generation カウンタで世代管理する。
 *
 * 呼び出し元: WaveformPlayer コンポーネント
 * 対になるクラス: なし（単独で使い切り）
 */
export class PlaybackController {
  private ctx: AudioContext;
  private buffers: AudioBuffer[];
  private sourceNodes: AudioBufferSourceNode[] = [];
  private startCtxTime = 0;
  private offset = 0;
  private _duration = 0;
  private _playing = false;
  /**
   * play/seek のたびにインクリメントされる世代番号。
   * 古い AudioBufferSourceNode の onended コールバックが発火しても、
   * generation が一致しなければ無視する。これにより、シーク時に
   * 前のノードの stop() → onended が再生終了と誤認される問題を防ぐ。
   */
  private generation = 0;
  onEnded: (() => void) | null = null;

  constructor(ctx: AudioContext, buffers: AudioBuffer[]) {
    this.ctx = ctx;
    this.buffers = buffers;
    this._duration = buffers.length > 0
      ? Math.max(...buffers.map((b) => b.duration))
      : 0;
  }

  get duration(): number {
    return this._duration;
  }

  get playing(): boolean {
    return this._playing;
  }

  get currentTime(): number {
    if (!this._playing) return this.offset;
    const elapsed = this.ctx.currentTime - this.startCtxTime + this.offset;
    return Math.min(elapsed, this._duration);
  }

  /** Start or resume playback from a given offset. */
  play(fromOffset?: number): void {
    if (fromOffset !== undefined) {
      this.offset = fromOffset;
    }

    this.destroySources();

    const gen = ++this.generation;
    const nodes: AudioBufferSourceNode[] = [];

    for (const buffer of this.buffers) {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      nodes.push(source);
    }

    // Attach onended to the longest track's source so playback state
    // is updated when the last track finishes naturally.
    if (nodes.length > 0) {
      const longestIdx = this.buffers.reduce(
        (maxI, b, i, arr) => (b.duration > arr[maxI]!.duration ? i : maxI),
        0,
      );
      nodes[longestIdx]!.onended = () => {
        if (gen !== this.generation) return;
        this._playing = false;
        this.offset = this._duration;
        this.onEnded?.();
      };
    }

    this.startCtxTime = this.ctx.currentTime;
    for (const node of nodes) {
      node.start(0, this.offset);
    }
    this.sourceNodes = nodes;
    this._playing = true;

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  /** Pause playback, preserving position for later resume. */
  pause(): void {
    if (!this._playing) return;
    this.offset = this.currentTime;
    this.destroySources();
    this._playing = false;
  }

  /** Seek to a position. If currently playing, restart from that position. */
  seek(time: number): void {
    this.offset = Math.max(0, Math.min(time, this._duration));
    if (this._playing) {
      this.play(this.offset);
    }
  }

  /** Clean up all resources. */
  dispose(): void {
    this.destroySources();
    this.onEnded = null;
  }

  private destroySources(): void {
    this.generation++;
    for (const node of this.sourceNodes) {
      try {
        node.onended = null;
        node.stop();
        node.disconnect();
      } catch {
        // Already stopped
      }
    }
    this.sourceNodes = [];
  }
}
