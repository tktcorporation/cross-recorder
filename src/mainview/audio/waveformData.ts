/**
 * AudioBuffer のチャンネルデータから、指定本数の棒グラフ高さ配列を生成する。
 * 各棒の値はそのセグメントの RMS (0〜1)。
 */
export function computeWaveformBars(
  channelData: Float32Array,
  barCount: number,
): number[] {
  const bars: number[] = Array.from({ length: barCount }, () => 0);
  if (channelData.length === 0 || barCount <= 0) return bars;

  const samplesPerBar = channelData.length / barCount;

  for (let i = 0; i < barCount; i++) {
    const start = Math.floor(i * samplesPerBar);
    const end = Math.floor((i + 1) * samplesPerBar);
    let sumSquares = 0;
    for (let j = start; j < end; j++) {
      sumSquares += channelData[j]! * channelData[j]!;
    }
    const rms = Math.sqrt(sumSquares / (end - start));
    bars[i] = Math.min(1, rms);
  }

  return bars;
}
