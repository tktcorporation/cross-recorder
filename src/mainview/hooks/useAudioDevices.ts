import { useEffect } from "react";
import { useRecordingStore } from "../stores/recordingStore.js";
import { MicrophoneCapture } from "@audio/MicrophoneCapture.js";

export function useAudioDevices() {
  const devices = useRecordingStore((s) => s.devices);
  const setDevices = useRecordingStore((s) => s.setDevices);
  const selectedMicId = useRecordingStore((s) => s.selectedMicId);
  const setSelectedMicId = useRecordingStore((s) => s.setSelectedMicId);

  const enumerate = async () => {
    let list = await MicrophoneCapture.enumerateDevices();

    if (list.length === 0) {
      // Request mic permission to get labeled devices
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        for (const track of stream.getTracks()) {
          track.stop();
        }
        list = await MicrophoneCapture.enumerateDevices();
      } catch {
        // Permission denied; leave list empty
      }
    }

    setDevices(list);

    // Auto-select default or first device
    if (list.length > 0 && !selectedMicId) {
      const defaultDev = list.find((d) => d.isDefault);
      setSelectedMicId(defaultDev ? defaultDev.deviceId : list[0]!.deviceId);
    }
  };

  useEffect(() => {
    enumerate();

    const onChange = () => {
      enumerate();
    };

    navigator.mediaDevices.addEventListener("devicechange", onChange);

    // Listen for device list changes from bun process
    const onDeviceListChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        devices: typeof devices;
      };
      setDevices(detail.devices);
    };
    window.addEventListener("device-list-changed", onDeviceListChanged);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", onChange);
      window.removeEventListener("device-list-changed", onDeviceListChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { devices, selectedMicId, setSelectedMicId };
}
