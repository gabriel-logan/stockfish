import type { ClassificationValue } from "./chess-types";

export interface MoveEntry {
  san: string;
  fen: string;
  color: "w" | "b";
  from?: string;
  to?: string;
  uci?: string;
  clock?: string;
  elapsed?: string;
  comment?: string;
  captured?: "p" | "n" | "b" | "r" | "q";
  isManual?: boolean;
  classification?: ClassificationValue;
  evaluationBefore?: number;
  mateBefore?: number;
  evaluation?: number;
  mate?: number;
}
