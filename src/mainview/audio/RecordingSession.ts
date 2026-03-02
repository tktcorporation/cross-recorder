// src/mainview/audio/RecordingSession.ts

import type { SessionState, SessionEvent, SessionEventMap } from "./types.js";

type Listener<T extends keyof SessionEventMap> = SessionEventMap[T];

export class RecordingSession {
  private state: SessionState = { type: "idle" };
  private listeners: Map<string, Set<Function>> = new Map();

  getState(): SessionState {
    return this.state;
  }

  dispatch(event: SessionEvent): void {
    const nextState = this.transition(this.state, event);
    if (nextState === null) return;
    this.state = nextState;
    this.emit("stateChange", nextState);
  }

  on<T extends keyof SessionEventMap>(
    event: T,
    listener: Listener<T>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  private emit<T extends keyof SessionEventMap>(
    event: T,
    ...args: Parameters<SessionEventMap[T]>
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        (listener as Function)(...args);
      }
    }
  }

  private transition(
    current: SessionState,
    event: SessionEvent,
  ): SessionState | null {
    switch (current.type) {
      case "idle":
        return this.fromIdle(event);
      case "acquiring":
        return this.fromAcquiring(event);
      case "recording":
        return this.fromRecording(current, event);
      case "degraded":
        return this.fromDegraded(current, event);
      case "stopping":
        return this.fromStopping(current, event);
      case "error":
        return this.fromError(event);
      default:
        return null;
    }
  }

  private fromIdle(event: SessionEvent): SessionState | null {
    if (event.type === "START") {
      return { type: "acquiring", requestedTracks: event.requestedTracks };
    }
    return null;
  }

  private fromAcquiring(event: SessionEvent): SessionState | null {
    if (event.type === "ACQUIRED") {
      return {
        type: "recording",
        sessionId: event.sessionId,
        activeTracks: event.tracks,
        startTime: Date.now(),
      };
    }
    if (event.type === "ERROR") {
      return {
        type: "error",
        message: event.reason,
        lastSessionId: undefined,
      };
    }
    return null;
  }

  private fromRecording(
    current: Extract<SessionState, { type: "recording" }>,
    event: SessionEvent,
  ): SessionState | null {
    if (event.type === "TRACK_LOST") {
      const remaining = current.activeTracks.filter((t) => t !== event.track);
      if (remaining.length === 0) {
        return { type: "stopping", sessionId: current.sessionId };
      }
      return {
        type: "degraded",
        sessionId: current.sessionId,
        activeTracks: remaining,
        lostTracks: [event.track],
        startTime: current.startTime,
      };
    }
    if (event.type === "STOP") {
      return { type: "stopping", sessionId: current.sessionId };
    }
    if (event.type === "ERROR") {
      return { type: "stopping", sessionId: current.sessionId };
    }
    return null;
  }

  private fromDegraded(
    current: Extract<SessionState, { type: "degraded" }>,
    event: SessionEvent,
  ): SessionState | null {
    if (event.type === "TRACK_LOST") {
      const remaining = current.activeTracks.filter((t) => t !== event.track);
      if (remaining.length === 0) {
        return { type: "stopping", sessionId: current.sessionId };
      }
      return {
        ...current,
        activeTracks: remaining,
        lostTracks: [...current.lostTracks, event.track],
      };
    }
    if (event.type === "STOP" || event.type === "ALL_TRACKS_LOST") {
      return { type: "stopping", sessionId: current.sessionId };
    }
    if (event.type === "ERROR") {
      return { type: "stopping", sessionId: current.sessionId };
    }
    return null;
  }

  private fromStopping(
    current: Extract<SessionState, { type: "stopping" }>,
    event: SessionEvent,
  ): SessionState | null {
    if (event.type === "FINALIZED") {
      return { type: "idle" };
    }
    if (event.type === "ERROR") {
      return {
        type: "error",
        message: event.reason,
        lastSessionId: current.sessionId,
      };
    }
    return null;
  }

  private fromError(event: SessionEvent): SessionState | null {
    if (event.type === "DISMISS") {
      return { type: "idle" };
    }
    return null;
  }
}
