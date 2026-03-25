import Electrobun, { Electroview } from "electrobun/view";
import type { CrossRecorderRPC } from "@shared/rpc-schema.js";

const rpc = Electroview.defineRPC<CrossRecorderRPC>({
  handlers: {
    requests: {},
    messages: {
      recordingStatus: (data) => {
        window.dispatchEvent(
          new CustomEvent("recording-status", { detail: data }),
        );
      },
      deviceListChanged: (data) => {
        window.dispatchEvent(
          new CustomEvent("device-list-changed", { detail: data }),
        );
      },
      updateStatus: (data) => {
        window.dispatchEvent(
          new CustomEvent("update-status", { detail: data }),
        );
      },
      nativeSystemAudioLevel: (data) => {
        window.dispatchEvent(
          new CustomEvent("native-system-audio-level", { detail: data }),
        );
      },
      nativeSystemAudioError: (data) => {
        window.dispatchEvent(
          new CustomEvent("native-system-audio-error", { detail: data }),
        );
      },
      transcriptionStatus: (data) => {
        window.dispatchEvent(
          new CustomEvent("transcription-status", { detail: data }),
        );
      },
    },
  },
});

const electrobun = new Electrobun.Electroview({ rpc });

export { rpc };
export default electrobun;
