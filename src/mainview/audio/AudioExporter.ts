import { Mp3Encoder } from "@breezystack/lamejs";
import { EXPORT_MP3_BITRATE } from "@shared/constants.js";
import type { ExportFormat } from "@shared/types.js";
import { createWavHeader } from "./WavEncoder.js";

/**
 * エンコード対象の PCM 音源を表す最小インターフェース。
 *
 * 背景: ブラウザの AudioBuffer はこの形を満たすため、本番では AudioBuffer を
 * そのまま渡す。一方このインターフェースに依存することで、エンコード関数を
 * AudioBuffer (= Web Audio 実装) 無しでも単体テストできるようにしている。
 */
export type PcmSource = {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
};

/** lamejs が 1 回の encodeBuffer で扱うサンプル数 (MPEG フレーム長)。 */
const MP3_BLOCK_SIZE = 1152;

/** Float32 サンプル [-1, 1] を 16bit PCM に変換する (クリッピングは飽和)。 */
function floatToInt16Sample(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

function floatToInt16Array(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = floatToInt16Sample(input[i]!);
  }
  return out;
}

/**
 * 複数トラックの AudioBuffer を 1 本にミックスダウンする。
 *
 * 各トラックを OfflineAudioContext の destination に接続して合算することで、
 * 長さやチャンネル数が異なるトラックも Web Audio のミキシングに委ねる。
 * 全トラックは同一サンプルレートにデコード済み (再生用 AudioContext と同じ) である前提。
 */
export async function mixTracks(buffers: AudioBuffer[]): Promise<AudioBuffer> {
  if (buffers.length === 0) {
    throw new Error("No tracks to mix");
  }
  if (buffers.length === 1) {
    return buffers[0]!;
  }

  const sampleRate = buffers[0]!.sampleRate;
  const numberOfChannels = Math.max(
    ...buffers.map((b) => b.numberOfChannels),
  );
  const length = Math.max(...buffers.map((b) => b.length));

  const ctx = new OfflineAudioContext(numberOfChannels, length, sampleRate);
  for (const buffer of buffers) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  }
  return ctx.startRendering();
}

/** PCM 音源を 16bit PCM の WAV (44 byte ヘッダ付き) にエンコードする。 */
export function encodeWav(source: PcmSource): Uint8Array {
  const { numberOfChannels, length, sampleRate } = source;
  const bytesPerSample = 2;
  const dataSize = length * numberOfChannels * bytesPerSample;

  const out = new Uint8Array(44 + dataSize);
  out.set(
    new Uint8Array(
      createWavHeader({ sampleRate, channels: numberOfChannels, bitDepth: 16, dataSize }),
    ),
    0,
  );

  const view = new DataView(out.buffer);
  const channels: Float32Array[] = [];
  for (let c = 0; c < numberOfChannels; c++) {
    channels.push(source.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numberOfChannels; c++) {
      view.setInt16(offset, floatToInt16Sample(channels[c]![i]!), true);
      offset += 2;
    }
  }
  return out;
}

/** PCM 音源を MP3 にエンコードする。lamejs はモノラル/ステレオのみ対応。 */
export function encodeMp3(
  source: PcmSource,
  bitrate: number = EXPORT_MP3_BITRATE,
): Uint8Array {
  const channels = Math.min(source.numberOfChannels, 2);
  const encoder = new Mp3Encoder(channels, source.sampleRate, bitrate);

  const left = floatToInt16Array(source.getChannelData(0));
  const right =
    channels > 1 ? floatToInt16Array(source.getChannelData(1)) : undefined;

  const chunks: Uint8Array[] = [];
  for (let i = 0; i < source.length; i += MP3_BLOCK_SIZE) {
    const leftBlock = left.subarray(i, i + MP3_BLOCK_SIZE);
    const block = right
      ? encoder.encodeBuffer(leftBlock, right.subarray(i, i + MP3_BLOCK_SIZE))
      : encoder.encodeBuffer(leftBlock);
    if (block.length > 0) chunks.push(block);
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);

  return concatChunks(chunks);
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Uint8Array を base64 文字列に変換する。
 *
 * RPC は base64 文字列でしかバイナリを渡せないため。
 * String.fromCharCode に巨大な配列を spread するとスタック超過するので、
 * 32KB ずつ分割して変換する。
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * 複数トラックを 1 本にミックスダウンし、指定フォーマットでエンコードする。
 *
 * 呼び出し元: ExpandedPlayer のエクスポート操作。
 */
export async function exportTracks(
  buffers: AudioBuffer[],
  format: ExportFormat,
): Promise<Uint8Array> {
  const mixed = await mixTracks(buffers);
  return format === "mp3" ? encodeMp3(mixed) : encodeWav(mixed);
}
