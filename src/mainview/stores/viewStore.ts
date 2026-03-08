import { create } from "zustand";

/**
 * 画面遷移を管理するストア。
 * 録音画面とライブラリ画面の切替、および遷移方向（アニメーション用）を保持する。
 * direction: 1 = 右へスライド(録音→ライブラリ)、-1 = 左へスライド(ライブラリ→録音)
 */
type View = "recording" | "library";

type ViewStore = {
  currentView: View;
  direction: 1 | -1;
  setView: (view: View) => void;
};

export const useViewStore = create<ViewStore>((set, get) => ({
  currentView: "recording",
  direction: 1,
  setView: (view) => {
    const current = get().currentView;
    if (current === view) return;
    set({
      currentView: view,
      direction: view === "library" ? 1 : -1,
    });
  },
}));
