import { baseUrlEngineWS } from "../constants";
import type {
  AnalysisData,
  BestMoveData,
  WSClientMessage,
  WSServerMessage,
} from "../types/engine";
import { decodeBinaryMessage, encodeBinaryMessage } from "./binaryMessage";

export type { AnalysisData, BestMoveData };

export interface AnalysisLine {
  score: number | null;
  mate: number | null;
  depth: number;
  multiPv: number;
  pv: string[];
}

interface ActiveAnalysisRequest {
  fen: string;
  depth: number;
  multiPv: number;
}

type StrengthSetting =
  | {
      type: "elo";
      elo: number;
    }
  | {
      type: "full";
    };

const reconnectBaseDelayMs = 1000;
const reconnectMaxDelayMs = 10000;

export class AnalysisEngine {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private shouldReconnect = false;
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectPromise: Promise<void> | null = null;
  private activeFen: string | null = null;
  private activeAnalysisRequest: ActiveAnalysisRequest | null = null;
  private strengthSetting: StrengthSetting | null = null;

  onAnalysis: ((data: AnalysisData) => void) | null = null;
  onBestMove: ((data: BestMoveData) => void) | null = null;
  onReady: (() => void) | null = null;
  onError: ((error: string) => void) | null = null;
  onDisconnect: (() => void) | null = null;
  onReconnect: (() => void) | null = null;

  get connected(): boolean {
    return this.isConnected;
  }

  connect(): Promise<void> {
    this.shouldReconnect = true;

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.clearReconnectTimer();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.isConnected = true;
      return Promise.resolve();
    }

    this.connectPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(baseUrlEngineWS);
      ws.binaryType = "arraybuffer";
      this.ws = ws;

      let settled = false;

      ws.onopen = () => {
        const wasReconnecting = this.isReconnecting;

        settled = true;
        this.ws = ws;
        this.isConnected = true;
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.connectPromise = null;
        this.restoreConnectionState();

        resolve();

        if (wasReconnecting) {
          this.onReconnect?.();
        }
      };

      ws.onmessage = (event) => {
        let msg: WSServerMessage;

        try {
          msg = decodeBinaryMessage<WSServerMessage>(event.data);
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
            this.activeAnalysisRequest = null;
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
        if (!settled) {
          settled = true;
          this.connectPromise = null;
          reject(new Error("WebSocket connection failed"));
        }
      };

      ws.onclose = () => {
        if (this.ws !== ws) {
          return;
        }

        this.isConnected = false;
        this.ws = null;
        this.connectPromise = null;

        if (!settled) {
          settled = true;
          reject(new Error("WebSocket connection closed"));
        }

        if (this.shouldReconnect) {
          this.onDisconnect?.();
          this.scheduleReconnect();
        }
      };
    });

    return this.connectPromise;
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.ws?.close();
    this.ws = null;
    this.isConnected = false;
    this.connectPromise = null;
    this.activeAnalysisRequest = null;
  }

  private send(msg: WSClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(encodeBinaryMessage(msg));
    }
  }

  private sendEloOptions(elo: number): void {
    this.send({ type: "setoption", fen: "UCI_LimitStrength", moves: "true" });
    this.send({ type: "setoption", fen: "UCI_Elo", moves: String(elo) });
  }

  setElo(elo: number): void {
    this.strengthSetting = { type: "elo", elo };
    this.sendEloOptions(elo);
  }

  setFullStrength(): void {
    this.strengthSetting = { type: "full" };
    this.send({ type: "setoption", fen: "UCI_LimitStrength", moves: "false" });
  }

  startAnalysis(fen: string, depth: number = 14, multiPv: number = 1): void {
    this.activeFen = fen;
    this.activeAnalysisRequest = { fen, depth, multiPv };
    this.send({ type: "start", fen, depth, multi_pv: multiPv });
  }

  stopAnalysis(): void {
    this.activeAnalysisRequest = null;
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

  private restoreConnectionState(): void {
    if (this.strengthSetting?.type === "elo") {
      this.sendEloOptions(this.strengthSetting.elo);
    }

    if (this.strengthSetting?.type === "full") {
      this.send({
        type: "setoption",
        fen: "UCI_LimitStrength",
        moves: "false",
      });
    }

    if (this.activeAnalysisRequest) {
      const { fen, depth, multiPv } = this.activeAnalysisRequest;

      this.send({ type: "start", fen, depth, multi_pv: multiPv });
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer) {
      return;
    }

    this.isReconnecting = true;

    const delay = Math.min(
      reconnectBaseDelayMs * 2 ** this.reconnectAttempts,
      reconnectMaxDelayMs,
    );

    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => {
        this.scheduleReconnect();
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
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
