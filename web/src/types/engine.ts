// ── WebSocket message types ──

export type WSMessageType =
  "ready" | "start" | "stop" | "setoption" | "analysis" | "bestmove" | "error";

// Client → Server
export type WSClientMessage =
  | {
      type: "start";
      fen: string;
      depth: number;
      multi_pv: number;
    }
  | {
      type: "stop";
    }
  | {
      type: "setoption";
      fen: string;
      moves: string;
    };

// Server → Client
export type WSServerMessage =
  | {
      type: "ready";
    }
  | {
      type: "analysis";
      depth: number;
      seldepth?: number;
      multi_pv?: number;
      score?: number;
      mate?: number;
      pv?: string[];
      nodes?: number;
      nps?: number;
      time_ms?: number;
    }
  | {
      type: "bestmove";
      bestmove: string;
      ponder?: string;
    }
  | {
      type: "error";
      error: string;
    };

// ── REST API types ──

export interface AnalyzeRequest {
  fen: string;
  depth: number;
  multi_pv: number;
}

export interface AnalysisEntry {
  type: string;
  depth: number;
  seldepth?: number;
  multi_pv?: number;
  score?: number;
  mate?: number;
  pv?: string[];
  nodes?: number;
  nps?: number;
  time_ms?: number;
}

export interface AnalyzeResponse {
  bestmove?: string;
  ponder?: string;
  analysis: AnalysisEntry[];
}

// ── Parsed / high-level types ──

export interface AnalysisData {
  score: number | null;
  mate: number | null;
  depth: number;
  multiPv: number;
  pv: string[];
}

export interface BestMoveData {
  bestmove: string | null;
  ponder: string | null;
}
