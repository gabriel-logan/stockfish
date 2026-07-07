export interface AnalysisData {
  score: number | null;
  mate: number | null;
  depth: number;
  pv: string[];
}

export interface BestMoveData {
  bestmove: string | null;
  ponder: string | null;
}

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

      const ws = new WebSocket("ws://localhost:3000/ws");
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        this.ws = ws;
        this.isConnected = true;
        resolve();
      };

      ws.onmessage = (event) => {
        const text = new TextDecoder().decode(event.data);
        let msg: Record<string, unknown>;

        try {
          msg = JSON.parse(text);
        } catch {
          return;
        }

        if (msg.type === "ready") {
          this.onReady?.();
          return;
        }

        if (msg.type === "analysis") {
          this.onAnalysis?.({
            score: typeof msg.score === "number" ? msg.score : null,
            mate: typeof msg.mate === "number" ? msg.mate : null,
            depth: typeof msg.depth === "number" ? msg.depth : 0,
            pv: Array.isArray(msg.pv) ? (msg.pv as string[]) : [],
          });
          return;
        }

        if (msg.type === "bestmove") {
          this.onBestMove?.({
            bestmove: typeof msg.bestmove === "string" ? msg.bestmove : null,
            ponder: typeof msg.ponder === "string" ? msg.ponder : null,
          });
          return;
        }

        if (msg.type === "error") {
          this.onError?.(
            typeof msg.error === "string" ? msg.error : "Unknown error",
          );
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

  send(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  setOption(name: string, value: string): void {
    this.send({ type: "setoption", fen: name, moves: value });
  }

  private currentSkill: number = 10;

  setSkillLevel(skill: number): void {
    this.currentSkill = skill;
    this.setOption("Skill Level", String(skill));
  }

  startAnalysis(fen: string, depth: number = 0, multiPv: number = 1): void {
    this.setOption("Skill Level", String(this.currentSkill));
    this.send({ type: "start", fen, depth, multi_pv: multiPv });
  }

  stopAnalysis(): void {
    this.send({ type: "stop" });
  }

  analyzePosition(
    fen: string,
    depth: number = 14,
    timeoutMs: number = 30000,
  ): Promise<{
    score: number | null;
    mate: number | null;
    bestmove: string | null;
  }> {
    return new Promise((resolve) => {
      let lastScore: number | null = null;
      let lastMate: number | null = null;

      const prevOnAnalysis = this.onAnalysis;
      const prevOnBestMove = this.onBestMove;

      const timer = setTimeout(() => {
        this.onAnalysis = prevOnAnalysis;
        this.onBestMove = prevOnBestMove;
        resolve({ score: lastScore, mate: lastMate, bestmove: null });
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
          bestmove: data.bestmove,
        });
      };

      this.startAnalysis(fen, depth, 1);
    });
  }
}
