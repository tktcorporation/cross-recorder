/**
 * 時間・録音メタデータ表示のフォーマッタ。録音タイマー・再生系UI・
 * ライブラリカードで共有する（RecordingCard / ExpandedPlayer / PostRecordingPlayer）。
 */

/** ミリ秒 → "HH:MM:SS"（録音タイマー表示用、常に時・分・秒をゼロ埋め） */
export function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

/** 秒 → "M:SS"（再生プレーヤーの経過/合計時間表示用） */
export function formatPlaybackTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** ミリ秒 → "M:SS"（ライブラリカードの録音時間表示用） */
export function formatDurationMs(ms: number): string {
  return formatPlaybackTime(ms / 1000);
}

/** バイト → "X.X MB" or "X.X KB" */
export function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

/** ISO文字列 → "YYYY/MM/DD HH:MM" */
export function formatRecordedAt(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${mo}/${day} ${h}:${mi}`;
}

/** トラック種別 (mic/system) の表示名 */
export function trackKindLabel(trackKind: string): string {
  return trackKind === "mic" ? "Mic" : "System";
}

/** チャンネル数の表示名 (Mono/Stereo) */
export function channelsLabel(channels: number): string {
  return channels === 1 ? "Mono" : "Stereo";
}
