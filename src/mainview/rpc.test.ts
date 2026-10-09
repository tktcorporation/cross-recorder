import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrossRecorderRPC } from "@shared/rpc-schema.js";

const transport = vi.hoisted(() => ({ dispatchEvent: vi.fn() }));
vi.mock("electrobun/view", () => {
  class Electroview {
    static defineRPC(options: object) { return options; }
  }
  return { default: { Electroview }, Electroview };
});

import { rpc } from "./rpc.js";

type Messages = CrossRecorderRPC["webview"]["messages"];
type Handlers = { [K in keyof Messages]: (detail: Messages[K]) => void };
const messages = (rpc as unknown as { handlers: { messages: Handlers } }).handlers.messages;

describe("native RPC window events", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("native セッション識別子と受信状態を window 境界まで保持する", () => {
    vi.stubGlobal("window", transport);
    vi.stubGlobal("CustomEvent", class {
      constructor(public type: string, public options: { detail: object }) {}
      get detail() { return this.options.detail; }
    });
    messages.nativeSystemAudioError({ sessionId: "old-session", reason: "EOF" });
    messages.nativeSystemAudioReceiveState({ sessionId: "current-session", status: "gap" });
    messages.nativeSystemAudioReceiveState({ sessionId: "current-session", status: "receiving" });
    messages.nativeSystemAudioLevel({ sessionId: "old-session", level: 0.8 });
    expect(transport.dispatchEvent.mock.calls.map(([event]) => ({ type: event.type, detail: event.detail }))).toEqual([
      { type: "native-system-audio-error", detail: { sessionId: "old-session", reason: "EOF" } },
      { type: "native-system-audio-receive-state", detail: { sessionId: "current-session", status: "gap" } },
      { type: "native-system-audio-receive-state", detail: { sessionId: "current-session", status: "receiving" } },
      { type: "native-system-audio-level", detail: { sessionId: "old-session", level: 0.8 } },
    ]);
  });
});
