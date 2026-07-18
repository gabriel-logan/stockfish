import type { ClassificationValue } from "./types/chess-types";
import en from "./utils/locales/en.json";
import pt from "./utils/locales/pt.json";

export const resources = {
  en: {
    translation: en,
  },
  pt: {
    translation: pt,
  },
};

export const MoveClassification = {
  Blunder: "blunder",
  Mistake: "mistake",
  Inaccuracy: "inaccuracy",
  Okay: "okay",
  Excellent: "excellent",
  Best: "best",
  Forced: "forced",
  Opening: "opening",
  Perfect: "perfect",
  Splendid: "splendid",
} as const satisfies Record<
  string,
  keyof typeof resources.en.translation.classification
>;

export const ChessSide = {
  White: "w",
  Black: "b",
} as const;

export const CLASSIFICATION_COLORS: Record<ClassificationValue, string> = {
  [MoveClassification.Blunder]: "#df5353",
  [MoveClassification.Mistake]: "#e69f00",
  [MoveClassification.Inaccuracy]: "#f2be1f",
  [MoveClassification.Okay]: "#74b038",
  [MoveClassification.Excellent]: "#22ac38",
  [MoveClassification.Best]: "#22ac38",
  [MoveClassification.Forced]: "#dbac86",
  [MoveClassification.Opening]: "#dbac86",
  [MoveClassification.Perfect]: "#3894eb",
  [MoveClassification.Splendid]: "#19d4af",
};

export const baseUrlEngine = import.meta.env.VITE_ENGINE_BASE_URL;
export const baseUrlEngineWS = import.meta.env.VITE_ENGINE_BASE_URL_WS;
export const baseUrlApi = import.meta.env.VITE_API_BASE_URL;
export const baseUrlApiWS = import.meta.env.VITE_API_BASE_URL_WS;

export const STORAGE_KEY_PREFERENCES_STORE = "stockfish-preferences-store";
export const STORAGE_KEY_AUTH_STORE = "stockfish-auth-store";
