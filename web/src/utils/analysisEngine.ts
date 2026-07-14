import { baseUrlEngineWS } from "../constants";
import type {
  AnalysisData,
  BestMoveData,
  WSClientMessage,
  WSServerMessage,
} from "../types/engine";

export type { AnalysisData, BestMoveData };

export interface AnalysisLine {
  score: number | null;
  mate: number | null;
  depth: number;
  multiPv: number;
  pv: string[];
}

export class AnalysisEngine {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private activeFen: string | null = null;

  onAnalysis: ((data: AnalysisData) => void) | null = null;
  onBestMove: ((data: BestMoveData) => void) | null = null;
  onReady: (() => void) | null = null;
  onError: ((error: string) => void) | null = null;
  onDisconnect: (() => void) | null = null;

  get connected(): boolean {
    return this.isConnected;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.isConnected = true;
        resolve();
        return;
      }

      const ws = new WebSocket(baseUrlEngineWS);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        this.ws = ws;
        this.isConnected = true;
        resolve();
      };

      ws.onmessage = (event) => {
        const text = new TextDecoder().decode(event.data);
        let msg: WSServerMessage;

        try {
          msg = JSON.parse(text);
        } catch {
          return;
        }

        switch (msg.type) {
          case "ready":
            this.onReady?.();
            break;

          case "analysis":
            this.onAnalysis?.({
              score: this.normalizeForActiveSide(msg.score),
              mate: this.normalizeForActiveSide(msg.mate),
              depth: msg.depth,
              multiPv: msg.multi_pv ?? 1,
              pv: msg.pv ?? [],
            });
            break;

          case "bestmove":
            this.onBestMove?.({
              bestmove: msg.bestmove ?? null,
              ponder: msg.ponder ?? null,
            });
            break;

          case "error":
            this.onError?.(msg.error);
            break;
        }
      };

      ws.onerror = () => {
        reject(new Error("WebSocket connection failed"));
      };

      ws.onclose = () => {
        this.isConnected = false;
        this.ws = null;
        this.onDisconnect?.();
      };
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.isConnected = false;
  }

  private send(msg: WSClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private sendEloOptions(elo: number): void {
    this.send({ type: "setoption", fen: "UCI_LimitStrength", moves: "true" });
    this.send({ type: "setoption", fen: "UCI_Elo", moves: String(elo) });
  }

  setElo(elo: number): void {
    this.sendEloOptions(elo);
  }

  setFullStrength(): void {
    this.send({ type: "setoption", fen: "UCI_LimitStrength", moves: "false" });
  }

  startAnalysis(fen: string, depth: number = 14, multiPv: number = 1): void {
    this.activeFen = fen;
    this.send({ type: "start", fen, depth, multi_pv: multiPv });
  }

  stopAnalysis(): void {
    this.send({ type: "stop" });
  }

  analyzePosition(
    fen: string,
    depth: number = 14,
    multiPv: number = 1,
    timeoutMs: number = 30000,
  ): Promise<
    AnalysisData & {
      bestmove: string | null;
      lines: AnalysisLine[];
      completed: boolean;
    }
  > {
    return new Promise((resolve) => {
      let lastScore: number | null = null;
      let lastMate: number | null = null;
      const lines = new Map<number, AnalysisLine>();

      const prevOnAnalysis = this.onAnalysis;
      const prevOnBestMove = this.onBestMove;

      const timer = setTimeout(() => {
        this.onAnalysis = prevOnAnalysis;
        this.onBestMove = prevOnBestMove;
        resolve({
          score: lastScore,
          mate: lastMate,
          depth,
          multiPv: 1,
          pv: [],
          bestmove: null,
          lines: this.getSortedLines(lines),
          completed: false,
        });
      }, timeoutMs);

      this.onAnalysis = (data) => {
        const line: AnalysisLine = {
          score: data.score,
          mate: data.mate,
          depth: data.depth,
          multiPv: data.multiPv,
          pv: data.pv,
        };
        const existingLine = lines.get(data.multiPv);

        if (!existingLine || data.depth >= existingLine.depth) {
          lines.set(data.multiPv, line);
        }

        if (data.multiPv === 1 && data.score !== null) {
          lastScore = data.score;
        }

        if (data.multiPv === 1 && data.mate !== null) {
          lastMate = data.mate;
        }

        if (prevOnAnalysis && data.multiPv === 1) {
          prevOnAnalysis(data);
        }
      };

      this.onBestMove = (data) => {
        clearTimeout(timer);
        this.onAnalysis = prevOnAnalysis;
        this.onBestMove = prevOnBestMove;
        resolve({
          score: lastScore,
          mate: lastMate,
          depth,
          multiPv: 1,
          pv: [],
          bestmove: data.bestmove,
          lines: this.getSortedLines(lines),
          completed: true,
        });
      };

      this.startAnalysis(fen, depth, multiPv);
    });
  }

  private isBlackToMove(): boolean {
    return this.activeFen?.split(" ")[1] === "b";
  }

  private getSortedLines(lines: Map<number, AnalysisLine>): AnalysisLine[] {
    return [...lines.values()].sort((a, b) => {
      return a.multiPv - b.multiPv;
    });
  }

  private normalizeForActiveSide(value: number | undefined): number | null {
    if (value === undefined) {
      return null;
    }

    if (this.isBlackToMove()) {
      return -value;
    }

    return value;
  }
}
