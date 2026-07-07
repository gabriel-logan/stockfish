import { create } from "zustand";

interface SettingsState {
  showEvaluationBar: boolean;
  showMoveEvaluation: boolean;
  botElo: number;
  playerColor: "w" | "b";
  setShowEvaluationBar: (show: boolean) => void;
  setShowMoveEvaluation: (show: boolean) => void;
  setBotElo: (elo: number) => void;
  setPlayerColor: (color: "w" | "b") => void;
}

export const useSettingsStore = create<SettingsState>((set) => {
  return {
    showEvaluationBar: true,
    showMoveEvaluation: true,
    botElo: 1500,
    playerColor: "w",
    setShowEvaluationBar: (show) => {
      set({ showEvaluationBar: show });
    },
    setShowMoveEvaluation: (show) => {
      set({ showMoveEvaluation: show });
    },
    setBotElo: (elo) => {
      set({ botElo: elo });
    },
    setPlayerColor: (color) => {
      set({ playerColor: color });
    },
  };
});
