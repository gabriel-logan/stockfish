import { MoveClassification } from "./types/chess-types";

export const CLASSIFICATION_COLORS: Record<
  (typeof MoveClassification)[keyof typeof MoveClassification],
  string
> = {
  [MoveClassification.Opening]: "#dbac86",
  [MoveClassification.Forced]: "#dbac86",
  [MoveClassification.Splendid]: "#19d4af",
  [MoveClassification.Perfect]: "#3894eb",
  [MoveClassification.Best]: "#22ac38",
  [MoveClassification.Excellent]: "#22ac38",
  [MoveClassification.Okay]: "#74b038",
  [MoveClassification.Inaccuracy]: "#f2be1f",
  [MoveClassification.Mistake]: "#e69f00",
  [MoveClassification.Blunder]: "#df5353",
};

export const BaseUrlAPI = import.meta.env.VITE_BASE_URL_API;
export const BaseUrlWS = import.meta.env.VITE_BASE_URL_WS;

export const STORAGE_KEY_USER_STORE = "stockfish-user-store";
