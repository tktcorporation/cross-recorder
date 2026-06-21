/**
 * 時間表示のフォーマッタ。録音タイマー・LIVE インジケータで共有する。
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
