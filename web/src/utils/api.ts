import axios from "axios";

import { BaseUrlAPI } from "../constants";
import type {
  AnalysisEntry,
  AnalyzeRequest,
  AnalyzeResponse,
} from "../types/api";

export async function analyzePosition(
  fen: string,
  depth: number = 14,
  multiPv: number = 1,
): Promise<AnalyzeResponse> {
  const body: AnalyzeRequest = { fen, depth, multi_pv: multiPv };

  const response = await axios.post<AnalyzeResponse>(
    `${BaseUrlAPI}/api/analyze`,
    body,
  );

  return response.data;
}

export function getBestScore(analysis: AnalysisEntry[]): {
  score: number | null;
  mate: number | null;
} {
  let bestScore: number | null = null;
  let bestMate: number | null = null;
  let maxDepth = 0;

  for (const entry of analysis) {
    if (entry.depth >= maxDepth) {
      maxDepth = entry.depth;

      if (entry.score !== undefined) {
        bestScore = entry.score;
      }

      if (entry.mate !== undefined) {
        bestMate = entry.mate;
      }
    }
  }

  return { score: bestScore, mate: bestMate };
}
