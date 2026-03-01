import { create } from "zustand";
import type {
  AudioDevice,
  RecordingMetadata,
  RecordingState,
} from "@shared/types.js";

type RecordingStore = {
  // State
  recordingState: RecordingState;
  selectedMicId: string | null;
  micEnabled: boolean;
  systemAudioEnabled: boolean;
  devices: AudioDevice[];
  recordings: RecordingMetadata[];
  elapsedMs: number;
  fileSizeBytes: number;
  currentSessionId: string | null;
  playingRecordingId: string | null;
  micAnalyser: AnalyserNode | null;
  systemAnalyser: AnalyserNode | null;
  recordingError: string | null;

  // Actions
  setRecordingState: (state: RecordingState) => void;
  setSelectedMicId: (id: string | null) => void;
  setMicEnabled: (enabled: boolean) => void;
  setSystemAudioEnabled: (enabled: boolean) => void;
  setDevices: (devices: AudioDevice[]) => void;
  setRecordings: (recordings: RecordingMetadata[]) => void;
  addRecording: (recording: RecordingMetadata) => void;
  removeRecording: (id: string) => void;
  updateStatus: (elapsedMs: number, fileSizeBytes: number) => void;
  setCurrentSessionId: (id: string | null) => void;
  setPlayingRecordingId: (id: string | null) => void;
  setMicAnalyser: (analyser: AnalyserNode | null) => void;
  setSystemAnalyser: (analyser: AnalyserNode | null) => void;
  setRecordingError: (error: string | null) => void;
  reset: () => void;
};

const initialState = {
  recordingState: "idle" as RecordingState,
  selectedMicId: null,
  micEnabled: true,
  systemAudioEnabled: false,
  devices: [],
  recordings: [],
  elapsedMs: 0,
  fileSizeBytes: 0,
  currentSessionId: null,
  playingRecordingId: null,
  micAnalyser: null as AnalyserNode | null,
  systemAnalyser: null as AnalyserNode | null,
  recordingError: null as string | null,
};

export const useRecordingStore = create<RecordingStore>((set) => ({
  ...initialState,

  setRecordingState: (state) => set({ recordingState: state }),
  setSelectedMicId: (id) => set({ selectedMicId: id }),
  setMicEnabled: (enabled) => set({ micEnabled: enabled }),
  setSystemAudioEnabled: (enabled) => set({ systemAudioEnabled: enabled }),
  setDevices: (devices) => set({ devices }),
  setRecordings: (recordings) => set({ recordings }),
  addRecording: (recording) =>
    set((s) => ({ recordings: [recording, ...s.recordings] })),
  removeRecording: (id) =>
    set((s) => ({ recordings: s.recordings.filter((r) => r.id !== id) })),
  updateStatus: (elapsedMs, fileSizeBytes) =>
    set({ elapsedMs, fileSizeBytes }),
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
  setPlayingRecordingId: (id) => set({ playingRecordingId: id }),
  setMicAnalyser: (analyser) => set({ micAnalyser: analyser }),
  setSystemAnalyser: (analyser) => set({ systemAnalyser: analyser }),
  setRecordingError: (error) => set({ recordingError: error }),
  reset: () => set(initialState),
}));
