import { vi } from "vitest";

/**
 * MicrophoneCapture / SystemAudioCapture のテストで共通に使う
 * MediaStreamTrack / MediaStream のモックファクトリ。
 * 両クラスとも同じ track/stream シェイプ（addEventListener 等）に依存する
 * ため、モックの契約がずれると片方のスイートだけ壊れた実装を見逃す。
 */
export function createMockTrack(kind: "audio" | "video" = "audio", label = "mock-track") {
  return {
    kind,
    label,
    enabled: true,
    stop: vi.fn(),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

export function createMockStream(
  audioTracks: ReturnType<typeof createMockTrack>[] = [],
  videoTracks: ReturnType<typeof createMockTrack>[] = [],
) {
  const allTracks = [...audioTracks, ...videoTracks];
  return {
    getTracks: vi.fn(() => [...allTracks]),
    getAudioTracks: vi.fn(() => [...audioTracks]),
    getVideoTracks: vi.fn(() => [...videoTracks]),
    removeTrack: vi.fn(),
  };
}
