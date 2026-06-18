import { describe, it, expect } from "vitest";
import { encodeWav, encodeMp3, bytesToBase64, type PcmSource } from "./AudioExporter.js";

/** テスト用の PCM 音源を生成する (AudioBuffer 非依存)。 */
function makeSource(channels: Float32Array[], sampleRate = 48000): PcmSource {
  return {
    sampleRate,
    numberOfChannels: channels.length,
    length: channels[0]?.length ?? 0,
    getChannelData: (ch) => channels[ch]!,
  };
}

function readString(view: DataView, offset: number, length: number): string {
  let str = "";
  for (let i = 0; i < length; i++) str += String.fromCharCode(view.getUint8(offset + i));
  return str;
}

describe("encodeWav", () => {
  it("produces a valid 44-byte RIFF/WAVE header followed by PCM data", () => {
    const source = makeSource([new Float32Array([0, 0.5, -0.5, 1])], 48000);
    const wav = encodeWav(source);
    const view = new DataView(wav.buffer);

    expect(readString(view, 0, 4)).toBe("RIFF");
    expect(readString(view, 8, 4)).toBe("WAVE");
    expect(readString(view, 36, 4)).toBe("data");
    // mono, 4 samples, 16bit => 8 bytes data + 44 header
    expect(wav.byteLength).toBe(44 + 4 * 2);
    expect(view.getUint16(22, true)).toBe(1); // channels
    expect(view.getUint32(24, true)).toBe(48000); // sampleRate
  });

  it("interleaves stereo samples L,R,L,R", () => {
    const left = new Float32Array([1, 0]);
    const right = new Float32Array([0, -1]);
    const wav = encodeWav(makeSource([left, right]));
    const view = new DataView(wav.buffer);

    // first frame: L=1 (0x7fff), R=0
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(0);
    // second frame: L=0, R=-1 (-0x8000)
    expect(view.getInt16(48, true)).toBe(0);
    expect(view.getInt16(50, true)).toBe(-0x8000);
  });

  it("clamps out-of-range samples to 16bit limits", () => {
    const wav = encodeWav(makeSource([new Float32Array([2, -2])]));
    const view = new DataView(wav.buffer);
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });
});

describe("encodeMp3", () => {
  it("produces a non-empty MP3 byte stream with a valid frame sync", () => {
    // 1 秒分のサイン波 (mono) をエンコードして MP3 として成立することを確認
    const sampleRate = 48000;
    const samples = new Float32Array(sampleRate);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
    }
    const mp3 = encodeMp3(makeSource([samples], sampleRate), 192);

    expect(mp3.byteLength).toBeGreaterThan(0);
    // MPEG フレーム同期語: 11 bit すべて 1 (0xFF, 上位 3 bit)
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1]! & 0xe0).toBe(0xe0);
  });
});

describe("bytesToBase64", () => {
  it("round-trips through atob", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const b64 = bytesToBase64(bytes);
    const decoded = atob(b64);
    expect(decoded.length).toBe(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      expect(decoded.charCodeAt(i)).toBe(bytes[i]);
    }
  });

  it("handles arrays larger than the 32KB chunk boundary", () => {
    const bytes = new Uint8Array(0x8000 + 100);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const decoded = atob(bytesToBase64(bytes));
    expect(decoded.length).toBe(bytes.length);
    expect(decoded.charCodeAt(bytes.length - 1)).toBe((bytes.length - 1) % 256);
  });
});
