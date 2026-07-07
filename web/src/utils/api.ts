import axios from "axios";

import { BASE_URL_API } from "../constants";

interface AnalyzeResponse {
  bestmove?: string;
  ponder?: string;
  analysis: {
    type: string;
    depth: number;
    score?: number;
    mate?: number;
    pv?: string[];
    nodes?: number;
    nps?: number;
    time_ms?: number;
  }[];
}

export async function analyzePosition(
  fen: string,
  depth: number = 14,
  multiPv: number = 1,
): Promise<AnalyzeResponse> {
  const response = await axios.post<AnalyzeResponse>(
    `${BASE_URL_API}/api/analyze`,
    {
      fen,
      depth,
      multi_pv: multiPv,
    },
  );
  return response.data;
}

export function getBestScore(analysis: AnalyzeResponse["analysis"]): {
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
