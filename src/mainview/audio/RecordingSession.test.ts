// src/mainview/audio/RecordingSession.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { RecordingSession } from "./RecordingSession.js";
import type { SessionState } from "./types.js";

describe("RecordingSession", () => {
  let session: RecordingSession;
  let stateChanges: SessionState[];

  beforeEach(() => {
    session = new RecordingSession();
    stateChanges = [];
    session.on("stateChange", (state) => stateChanges.push(state));
  });

  describe("initial state", () => {
    it("starts in idle state", () => {
      expect(session.getState()).toEqual({ type: "idle" });
    });
  });

  describe("idle → acquiring", () => {
    it("transitions to acquiring on START", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      expect(session.getState()).toEqual({
        type: "acquiring",
        requestedTracks: ["mic"],
      });
    });

    it("emits stateChange event", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]).toEqual({
        type: "acquiring",
        requestedTracks: ["mic"],
      });
    });

    it("ignores STOP in idle state", () => {
      session.dispatch({ type: "STOP" });
      expect(session.getState()).toEqual({ type: "idle" });
      expect(stateChanges).toHaveLength(0);
    });
  });

  describe("acquiring → recording", () => {
    it("transitions to recording on ACQUIRED", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic", "system"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "test-session",
        tracks: ["mic", "system"],
      });
      const state = session.getState();
      expect(state.type).toBe("recording");
      if (state.type === "recording") {
        expect(state.sessionId).toBe("test-session");
        expect(state.activeTracks).toEqual(["mic", "system"]);
        expect(state.startTime).toBeGreaterThan(0);
      }
    });
  });

  describe("acquiring → error", () => {
    it("transitions to error on ERROR", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      session.dispatch({ type: "ERROR", reason: "Permission denied" });
      expect(session.getState()).toEqual({
        type: "error",
        message: "Permission denied",
        lastSessionId: undefined,
      });
    });
  });

  describe("recording → degraded", () => {
    it("transitions to degraded when one track is lost", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic", "system"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic", "system"],
      });
      session.dispatch({ type: "TRACK_LOST", track: "system" });
      const state = session.getState();
      expect(state.type).toBe("degraded");
      if (state.type === "degraded") {
        expect(state.activeTracks).toEqual(["mic"]);
        expect(state.lostTracks).toEqual(["system"]);
      }
    });
  });

  describe("recording → stopping", () => {
    it("transitions to stopping on STOP", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic"],
      });
      session.dispatch({ type: "STOP" });
      expect(session.getState()).toEqual({
        type: "stopping",
        sessionId: "s1",
      });
    });
  });

  describe("recording with single track → TRACK_LOST", () => {
    it("transitions directly to stopping when only track is lost", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic"],
      });
      session.dispatch({ type: "TRACK_LOST", track: "mic" });
      expect(session.getState()).toEqual({
        type: "stopping",
        sessionId: "s1",
      });
    });
  });

  describe("degraded → stopping", () => {
    it("transitions to stopping on STOP", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic", "system"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic", "system"],
      });
      session.dispatch({ type: "TRACK_LOST", track: "system" });
      session.dispatch({ type: "STOP" });
      expect(session.getState()).toEqual({
        type: "stopping",
        sessionId: "s1",
      });
    });

    it("transitions to stopping on ALL_TRACKS_LOST", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic", "system"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic", "system"],
      });
      session.dispatch({ type: "TRACK_LOST", track: "system" });
      session.dispatch({ type: "ALL_TRACKS_LOST" });
      expect(session.getState()).toEqual({
        type: "stopping",
        sessionId: "s1",
      });
    });
  });

  describe("stopping → idle", () => {
    it("transitions to idle on FINALIZED", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic"],
      });
      session.dispatch({ type: "STOP" });
      session.dispatch({ type: "FINALIZED" });
      expect(session.getState()).toEqual({ type: "idle" });
    });
  });

  describe("stopping → error", () => {
    it("transitions to error on ERROR with lastSessionId", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic"],
      });
      session.dispatch({ type: "STOP" });
      session.dispatch({ type: "ERROR", reason: "Finalize failed" });
      expect(session.getState()).toEqual({
        type: "error",
        message: "Finalize failed",
        lastSessionId: "s1",
      });
    });
  });

  describe("error → idle", () => {
    it("transitions to idle on DISMISS", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      session.dispatch({ type: "ERROR", reason: "test" });
      session.dispatch({ type: "DISMISS" });
      expect(session.getState()).toEqual({ type: "idle" });
    });
  });

  describe("invalid transitions are ignored", () => {
    it("ignores START when not idle", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic"],
      });
      session.dispatch({ type: "START", requestedTracks: ["system"] });
      expect(session.getState().type).toBe("recording");
    });

    it("ignores ACQUIRED when not acquiring", () => {
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic"],
      });
      expect(session.getState()).toEqual({ type: "idle" });
    });
  });

  describe("recording → stopping on ERROR", () => {
    it("transitions to stopping on ERROR to save data", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic"],
      });
      session.dispatch({ type: "ERROR", reason: "AudioContext closed" });
      expect(session.getState()).toEqual({
        type: "stopping",
        sessionId: "s1",
      });
    });
  });
});
