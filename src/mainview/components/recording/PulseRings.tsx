import { motion } from "framer-motion";

/**
 * 録音中にRecordButtonの背後に表示される同心円アニメーション。
 * micLevel/systemLevelに応じてスケールと不透明度が変化し、音声入力を視覚化する。
 * 録音していない場合は何もレンダリングしない。
 *
 * 背景: iOS Voice Memosの録音ボタン周囲の脈動エフェクトを参考にしている。
 */
type PulseRingsProps = {
  isRecording: boolean;
  micLevel: number;
  systemLevel: number;
};

export function PulseRings({
  isRecording,
  micLevel,
  systemLevel,
}: PulseRingsProps) {
  if (!isRecording) return null;

  /** レベル(0..1)からスケール(1..1.4)を算出 */
  const toScale = (level: number) => 1 + level * 0.4;
  /** レベル(0..1)から不透明度(0.15..0.5)を算出 */
  const toOpacity = (level: number) => 0.15 + level * 0.35;

  return (
    <>
      {/* マイク入力リング (recording color / red) — ボタンより少し大きく配置 */}
      <motion.div
        className="absolute inset-4 rounded-full bg-recording"
        animate={{
          scale: toScale(micLevel),
          opacity: toOpacity(micLevel),
        }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        aria-hidden
      />
      {/* システム音声リング (playback color / blue) — 最も外側 */}
      <motion.div
        className="absolute inset-2 rounded-full bg-playback"
        animate={{
          scale: toScale(systemLevel),
          opacity: toOpacity(systemLevel),
        }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        aria-hidden
      />
    </>
  );
}
