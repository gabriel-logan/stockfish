import { create } from "zustand";

import { UCI_ELO_DEFAULT } from "../utils/elo";

export const PIECE_SETS = [
  { value: "alpha", label: "Alpha" },
  { value: "anarcandy", label: "Anarcandy" },
  { value: "caliente", label: "Caliente" },
  { value: "california", label: "California" },
  { value: "cardinal", label: "Cardinal" },
  { value: "cburnett", label: "Cburnett" },
  { value: "celtic", label: "Celtic" },
  { value: "chess7", label: "Chess 7" },
  { value: "chessnut", label: "Chessnut" },
  { value: "chicago", label: "Chicago" },
  { value: "companion", label: "Companion" },
  { value: "cooke", label: "Cooke" },
  { value: "dubrovny", label: "Dubrovny" },
  { value: "fantasy", label: "Fantasy" },
  { value: "firi", label: "Firi" },
  { value: "fresca", label: "Fresca" },
  { value: "gioco", label: "Gioco" },
  { value: "governor", label: "Governor" },
  { value: "horsey", label: "Horsey" },
  { value: "icpieces", label: "Chesskit" },
  { value: "iowa", label: "Iowa" },
  { value: "kiwen-suwi", label: "Kiwen Suwi" },
  { value: "kosal", label: "Kosal" },
  { value: "leipzig", label: "Leipzig" },
  { value: "letter", label: "Letter" },
  { value: "maestro", label: "Maestro" },
  { value: "merida", label: "Merida" },
  { value: "monarchy", label: "Monarchy" },
  { value: "mpchess", label: "MP Chess" },
  { value: "oslo", label: "Oslo" },
  { value: "pirouetti", label: "Pirouetti" },
  { value: "pixel", label: "Pixel" },
  { value: "reillycraig", label: "Reilly Craig" },
  { value: "rhosgfx", label: "Rhosgfx" },
  { value: "riohacha", label: "Riohacha" },
  { value: "shapes", label: "Shapes" },
  { value: "spatial", label: "Spatial" },
  { value: "staunty", label: "Staunty" },
  { value: "symmetric", label: "Symmetric" },
  { value: "tatiana", label: "Tatiana" },
  { value: "xkcd", label: "XKCD" },
] as const;

export type PieceSet = (typeof PIECE_SETS)[number]["value"];

interface SettingsState {
  showEvaluationBar: boolean;
  showMoveEvaluation: boolean;
  soundEnabled: boolean;
  botElo: number;
  playerColor: "w" | "b";
  pieceSet: PieceSet;
  setShowEvaluationBar: (show: boolean) => void;
  setShowMoveEvaluation: (show: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setBotElo: (elo: number) => void;
  setPlayerColor: (color: "w" | "b") => void;
  setPieceSet: (pieceSet: PieceSet) => void;
}

export const useSettingsStore = create<SettingsState>((set) => {
  return {
    showEvaluationBar: true,
    showMoveEvaluation: true,
    soundEnabled: true,
    botElo: UCI_ELO_DEFAULT,
    playerColor: "w",
    pieceSet: "maestro",
    setShowEvaluationBar: (show) => {
      set({ showEvaluationBar: show });
    },
    setShowMoveEvaluation: (show) => {
      set({ showMoveEvaluation: show });
    },
    setSoundEnabled: (enabled) => {
      set({ soundEnabled: enabled });
    },
    setBotElo: (elo) => {
      set({ botElo: elo });
    },
    setPlayerColor: (color) => {
      set({ playerColor: color });
    },
    setPieceSet: (pieceSet) => {
      set({ pieceSet });
    },
  };
});
