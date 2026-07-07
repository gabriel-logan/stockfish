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

export const BASE_URL_API = "http://localhost:3000";
export const BASE_URL_WS = "ws://localhost:3000/ws";
