import { create } from "zustand";
import type { UpdateStatus } from "@shared/types.js";

type UpdateStore = {
  updateStatus: UpdateStatus;
  updateVersion: string;
  progress: number;
  errorMessage: string;
  currentVersion: string;
  currentChannel: string;
  setStatus: (
    status: UpdateStatus,
    message: string,
    progress?: number,
  ) => void;
  setCurrentVersion: (version: string, channel: string) => void;
  reset: () => void;
};

export const useUpdateStore = create<UpdateStore>((set) => ({
  updateStatus: "idle",
  updateVersion: "",
  progress: 0,
  errorMessage: "",
  currentVersion: "",
  currentChannel: "",

  setStatus: (status, message, progress) =>
    set((state) => ({
      updateStatus: status,
      errorMessage: status === "error" ? message : state.errorMessage,
      progress: progress ?? state.progress,
    })),

  setCurrentVersion: (version, channel) =>
    set({ currentVersion: version, currentChannel: channel }),

  reset: () =>
    set({
      updateStatus: "idle",
      updateVersion: "",
      progress: 0,
      errorMessage: "",
    }),
}));
