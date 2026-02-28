import { describe, it, expect } from "vitest";
import { createWavHeader } from "./WavEncoder.js";

function readString(view: DataView, offset: number, length: number): string {
  let str = "";
  for (let i = 0; i < length; i++) {
    str += String.fromCharCode(view.getUint8(offset + i));
  }
  return str;
}

describe("createWavHeader", () => {
  it("generates a 44-byte WAV header", () => {
    const header = createWavHeader({
      sampleRate: 48000,
      channels: 2,
      bitDepth: 16,
      dataSize: 0,
    });
    expect(header.byteLength).toBe(44);
  });

  it("writes correct RIFF/WAVE markers", () => {
    const header = createWavHeader({
      sampleRate: 48000,
      channels: 2,
      bitDepth: 16,
      dataSize: 1000,
    });
    const view = new DataView(header);

    expect(readString(view, 0, 4)).toBe("RIFF");
    expect(readString(view, 8, 4)).toBe("WAVE");
    expect(readString(view, 12, 4)).toBe("fmt ");
    expect(readString(view, 36, 4)).toBe("data");
  });

  it("calculates file size correctly (36 + dataSize)", () => {
    const dataSize = 96000;
    const header = createWavHeader({
      sampleRate: 48000,
      channels: 2,
      bitDepth: 16,
      dataSize,
    });
    const view = new DataView(header);

    expect(view.getUint32(4, true)).toBe(36 + dataSize);
  });

  it("writes PCM format (audioFormat = 1)", () => {
    const header = createWavHeader({
      sampleRate: 48000,
      channels: 2,
      bitDepth: 16,
      dataSize: 0,
    });
    const view = new DataView(header);

    expect(view.getUint16(20, true)).toBe(1);
  });

  it("writes correct channel count", () => {
    for (const channels of [1, 2] as const) {
      const header = createWavHeader({
        sampleRate: 48000,
        channels,
        bitDepth: 16,
        dataSize: 0,
      });
      const view = new DataView(header);
      expect(view.getUint16(22, true)).toBe(channels);
    }
  });

  it("writes correct sample rate", () => {
    for (const sampleRate of [44100, 48000]) {
      const header = createWavHeader({
        sampleRate: sampleRate!,
        channels: 2,
        bitDepth: 16,
        dataSize: 0,
      });
      const view = new DataView(header);
      expect(view.getUint32(24, true)).toBe(sampleRate);
    }
  });

  it("calculates byteRate correctly (sampleRate * channels * bitDepth/8)", () => {
    const header = createWavHeader({
      sampleRate: 48000,
      channels: 2,
      bitDepth: 16,
      dataSize: 0,
    });
    const view = new DataView(header);

    // 48000 * 2 * (16/8) = 192000
    expect(view.getUint32(28, true)).toBe(192000);
  });

  it("calculates blockAlign correctly (channels * bitDepth/8)", () => {
    const header = createWavHeader({
      sampleRate: 48000,
      channels: 2,
      bitDepth: 16,
      dataSize: 0,
    });
    const view = new DataView(header);

    // 2 * (16/8) = 4
    expect(view.getUint16(32, true)).toBe(4);
  });

  it("writes correct bit depth", () => {
    const header = createWavHeader({
      sampleRate: 48000,
      channels: 2,
      bitDepth: 16,
      dataSize: 0,
    });
    const view = new DataView(header);

    expect(view.getUint16(34, true)).toBe(16);
  });

  it("writes data chunk size", () => {
    const dataSize = 192000;
    const header = createWavHeader({
      sampleRate: 48000,
      channels: 2,
      bitDepth: 16,
      dataSize,
    });
    const view = new DataView(header);

    expect(view.getUint32(40, true)).toBe(dataSize);
  });

  it("handles mono 44100Hz 16-bit configuration", () => {
    const header = createWavHeader({
      sampleRate: 44100,
      channels: 1,
      bitDepth: 16,
      dataSize: 88200,
    });
    const view = new DataView(header);

    expect(view.getUint16(22, true)).toBe(1); // channels
    expect(view.getUint32(24, true)).toBe(44100); // sampleRate
    expect(view.getUint32(28, true)).toBe(88200); // byteRate: 44100 * 1 * 2
    expect(view.getUint16(32, true)).toBe(2); // blockAlign: 1 * 2
    expect(view.getUint32(4, true)).toBe(36 + 88200); // fileSize
  });
});
