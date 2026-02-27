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
    },
  },
});

const electrobun = new Electrobun.Electroview({ rpc });

export { rpc };
export default electrobun;
