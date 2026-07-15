import { resources } from "../constants";

export type ClassificationValue =
  keyof typeof resources.en.translation.classification;

export type PromotionPiece = "q" | "r" | "b" | "n";
