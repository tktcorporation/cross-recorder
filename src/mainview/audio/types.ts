import type { TrackKind } from "@shared/types.js";

// ── Session State (Discriminated Union) ──

export type SessionState =
  | { type: "idle" }
  | { type: "acquiring"; requestedTracks: TrackKind[] }
  | {
      type: "recording";
      sessionId: string;
      activeTracks: TrackKind[];
      startTime: number;
    }
  | {
      type: "degraded";
      sessionId: string;
      activeTracks: TrackKind[];
      lostTracks: TrackKind[];
      startTime: number;
    }
  | { type: "stopping"; sessionId: string }
  | { type: "error"; message: string; lastSessionId?: string };

// ── Session Events ──

export type SessionEvent =
  | { type: "START"; requestedTracks: TrackKind[] }
  | { type: "ACQUIRED"; sessionId: string; tracks: TrackKind[] }
  | { type: "TRACK_LOST"; track: TrackKind }
  | { type: "ALL_TRACKS_LOST" }
  | { type: "STOP" }
  | { type: "FINALIZED" }
  | { type: "ERROR"; reason: string }
  | { type: "DISMISS" };

// ── Event Emitter Types ──

export type SessionEventMap = {
  stateChange: (state: SessionState) => void;
  error: (error: { reason: string; state: SessionState }) => void;
};
