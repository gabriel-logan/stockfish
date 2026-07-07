import { BASE_URL_WS } from "../constants";
import type {
  AnalysisData,
  BestMoveData,
  WSClientMessage,
  WSServerMessage,
} from "../types/api";

export type { AnalysisData, BestMoveData };

export class AnalysisEngine {
  private ws: WebSocket | null = null;
  private isConnected = false;

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

      const ws = new WebSocket(BASE_URL_WS);
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
              score: msg.score ?? null,
              mate: msg.mate ?? null,
              depth: msg.depth,
              pv: msg.pv,
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

  private currentSkill: number = 10;

  setSkillLevel(skill: number): void {
    this.currentSkill = skill;
    this.send({ type: "setoption", fen: "Skill Level", moves: String(skill) });
  }

  startAnalysis(fen: string, depth: number = 14, multiPv: number = 1): void {
    this.send({
      type: "setoption",
      fen: "Skill Level",
      moves: String(this.currentSkill),
    });
    this.send({ type: "start", fen, depth, multi_pv: multiPv });
  }

  stopAnalysis(): void {
    this.send({ type: "stop" });
  }

  analyzePosition(
    fen: string,
    depth: number = 14,
    timeoutMs: number = 30000,
  ): Promise<AnalysisData & { bestmove: string | null }> {
    return new Promise((resolve) => {
      let lastScore: number | null = null;
      let lastMate: number | null = null;

      const prevOnAnalysis = this.onAnalysis;
      const prevOnBestMove = this.onBestMove;

      const timer = setTimeout(() => {
        this.onAnalysis = prevOnAnalysis;
        this.onBestMove = prevOnBestMove;
        resolve({
          score: lastScore,
          mate: lastMate,
          depth,
          pv: [],
          bestmove: null,
        });
      }, timeoutMs);

      this.onAnalysis = (data) => {
        if (data.score !== null) {
          lastScore = data.score;
        }

        if (data.mate !== null) {
          lastMate = data.mate;
        }

        if (prevOnAnalysis) {
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
          pv: [],
          bestmove: data.bestmove,
        });
      };

      this.startAnalysis(fen, depth, 1);
    });
  }
}
