import { useEffect } from "react";

/** Maps CustomEvent names dispatched by src/mainview/rpc.ts to their detail types. */
type WindowEventDetailMap = {
  "recording-status": {
    state: string;
    elapsedMs: number;
    fileSizeBytes: number;
  };
  "native-system-audio-level": { level: number };
  "native-system-audio-error": { reason: string };
  "device-list-changed": { devices: unknown[] };
  "update-status": {
    status: string;
    message: string;
    progress?: number;
  };
};

/**
 * Type-safe wrapper around window.addEventListener for CustomEvents
 * dispatched by the RPC message layer.
 */
export function useWindowEvent<K extends keyof WindowEventDetailMap>(
  eventName: K,
  handler: (detail: WindowEventDetailMap[K]) => void,
  deps: React.DependencyList = [],
): void {
  useEffect(() => {
    const listener = (e: Event) => {
      handler((e as CustomEvent).detail as WindowEventDetailMap[K]);
    };
    window.addEventListener(eventName, listener);
    return () => window.removeEventListener(eventName, listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName, ...deps]);
}
