import { MoveClassification } from "../types/chess-types";

export function classifyMove(
  evalBefore: number | null,
  evalAfter: number | null,
  color: "w" | "b",
  wasBestMove: boolean = false,
  isForced: boolean = false,
  isOpening: boolean = false,
): string {
  if (isOpening) {
    return MoveClassification.Opening;
  }

  if (isForced) {
    return MoveClassification.Forced;
  }

  if (wasBestMove) {
    return MoveClassification.Best;
  }

  if (evalBefore === null || evalAfter === null) {
    return MoveClassification.Okay;
  }

  let loss: number;
  if (color === "w") {
    loss = evalBefore - evalAfter;
  } else {
    loss = evalAfter - evalBefore;
  }

  if (loss <= 0.1) {
    return MoveClassification.Excellent;
  }

  if (loss <= 0.3) {
    return MoveClassification.Okay;
  }

  if (loss <= 0.6) {
    return MoveClassification.Inaccuracy;
  }

  if (loss <= 1.0) {
    return MoveClassification.Mistake;
  }

  return MoveClassification.Blunder;
}
