import { create } from "zustand";

interface SettingsState {
  showEvaluationBar: boolean;
  botElo: number;
  playerColor: "w" | "b";
  setShowEvaluationBar: (show: boolean) => void;
  setBotElo: (elo: number) => void;
  setPlayerColor: (color: "w" | "b") => void;
}

export const useSettingsStore = create<SettingsState>((set) => {
  return {
    showEvaluationBar: true,
    botElo: 1500,
    playerColor: "w",
    setShowEvaluationBar: (show) => {
      set({ showEvaluationBar: show });
    },
    setBotElo: (elo) => {
      set({ botElo: elo });
    },
    setPlayerColor: (color) => {
      set({ playerColor: color });
    },
  };
});
