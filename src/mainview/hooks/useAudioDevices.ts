import { useEffect } from "react";
import { useRecordingStore } from "../stores/recordingStore.js";
import { MicrophoneCapture } from "@audio/MicrophoneCapture.js";
import type { AudioDevice } from "@shared/types.js";

/**
 * 現在の選択 (selectedMicId) を最新のデバイス一覧と突き合わせて補正する。
 * 選択中のデバイスが一覧から消えていれば既定 (or 先頭) デバイスへフォール
 * バックする。有効な選択が残っている場合はそのまま返す — devicechange の
 * たびにユーザーの選択を勝手に上書きしないため。
 *
 * 一覧が空のときは選択を変更しない。devicechange は無関係な USB 機器の
 * 抜き差し等でも発火し、OS のデバイス再列挙中に一時的に空配列が返る
 * ことがあるため、空を「実際に選択中のマイクが無くなった」と即断すると
 * 一時的なイベントでユーザーの選択が失われてしまう。
 */
export function reconcileSelectedMic(
  list: AudioDevice[],
  currentSelectedMicId: string | null,
): string | null {
  if (list.length === 0) return currentSelectedMicId;

  if (
    currentSelectedMicId !== null &&
    list.some((d) => d.deviceId === currentSelectedMicId)
  ) {
    return currentSelectedMicId;
  }

  const defaultDev = list.find((d) => d.isDefault);
  return defaultDev ? defaultDev.deviceId : list[0]!.deviceId;
}

export function useAudioDevices() {
  const devices = useRecordingStore((s) => s.devices);
  const setDevices = useRecordingStore((s) => s.setDevices);
  const selectedMicId = useRecordingStore((s) => s.selectedMicId);
  const setSelectedMicId = useRecordingStore((s) => s.setSelectedMicId);

  useEffect(() => {
    // devicechange イベントは effect の初回マウント時にしか登録されないため、
    // ここで selectedMicId をクロージャで捕まえると値が固定されてしまう。
    // 常に store の最新値を getState() で読むことで、ユーザーが後から選択を
    // 変更してもその選択が devicechange のたびに上書きされないようにする。
    const applyDeviceList = (list: AudioDevice[]) => {
      setDevices(list);
      const current = useRecordingStore.getState().selectedMicId;
      const next = reconcileSelectedMic(list, current);
      if (next !== current) {
        useRecordingStore.getState().setSelectedMicId(next);
      }
    };

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

      applyDeviceList(list);
    };

    enumerate();

    const onChange = () => {
      enumerate();
    };

    navigator.mediaDevices.addEventListener("devicechange", onChange);

    // Listen for device list changes from bun process
    const onDeviceListChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        devices: AudioDevice[];
      };
      applyDeviceList(detail.devices);
    };
    window.addEventListener("device-list-changed", onDeviceListChanged);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", onChange);
      window.removeEventListener("device-list-changed", onDeviceListChanged);
    };
  }, [setDevices]);

  return { devices, selectedMicId, setSelectedMicId };
}
