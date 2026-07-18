import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnalysisEngine } from "./analysisEngine";

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  binaryType = "";
  readyState = 0;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
    this.onclose?.(new Event("close") as CloseEvent);
  });
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  receive(message: unknown): void {
    const data = new TextEncoder().encode(JSON.stringify(message));

    this.onmessage?.(
      new MessageEvent("message", {
        data: data.buffer,
      }),
    );
  }
}

describe("AnalysisEngine", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function connectEngine(): Promise<[AnalysisEngine, MockWebSocket]> {
    const engine = new AnalysisEngine();
    const connected = engine.connect();
    const socket = MockWebSocket.instances[0];

    socket.open();
    await connected;

    return [engine, socket];
  }

  it("normalizes analysis scores for the side to move and forwards engine events", async () => {
    const [engine, socket] = await connectEngine();
    const onReady = vi.fn();
    const onAnalysis = vi.fn();
    const onBestMove = vi.fn();
    const onError = vi.fn();

    engine.onReady = onReady;
    engine.onAnalysis = onAnalysis;
    engine.onBestMove = onBestMove;
    engine.onError = onError;
    engine.startAnalysis("8/8/8/8/8/8/8/8 b - - 0 1");

    socket.receive({ type: "ready" });
    socket.receive({
      type: "analysis",
      depth: 16,
      multi_pv: 2,
      score: 37,
      mate: 3,
      pv: ["e7e5"],
    });
    socket.receive({ type: "bestmove", bestmove: "e7e5", ponder: "g1f3" });
    socket.receive({ type: "error", error: "engine failed" });

    expect(onReady).toHaveBeenCalledOnce();
    expect(onAnalysis).toHaveBeenCalledWith({
      score: -37,
      mate: -3,
      depth: 16,
      multiPv: 2,
      pv: ["e7e5"],
    });
    expect(onBestMove).toHaveBeenCalledWith({
      bestmove: "e7e5",
      ponder: "g1f3",
    });
    expect(onError).toHaveBeenCalledWith("engine failed");
  });

  it("sends strength and analysis commands after connecting", async () => {
    const [engine, socket] = await connectEngine();

    engine.setElo(1200);
    engine.setFullStrength();
    engine.startAnalysis("fen", 18, 3);
    engine.stopAnalysis();

    expect(socket.send).toHaveBeenCalledTimes(5);
    expect(socket.send).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({
        type: "setoption",
        fen: "UCI_LimitStrength",
        moves: "true",
      }),
    );
    expect(socket.send).toHaveBeenNthCalledWith(
      3,
      JSON.stringify({
        type: "setoption",
        fen: "UCI_LimitStrength",
        moves: "false",
      }),
    );
    expect(socket.send).toHaveBeenNthCalledWith(
      4,
      JSON.stringify({ type: "start", fen: "fen", depth: 18, multi_pv: 3 }),
    );
    expect(socket.send).toHaveBeenNthCalledWith(
      5,
      JSON.stringify({ type: "stop" }),
    );
  });

  it("returns the deepest ordered multipv lines when analysis completes", async () => {
    const [engine, socket] = await connectEngine();
    const onAnalysis = vi.fn();
    engine.onAnalysis = onAnalysis;

    const result = engine.analyzePosition("fen", 20, 2);

    socket.receive({
      type: "analysis",
      depth: 14,
      multi_pv: 2,
      score: 20,
      pv: ["d2d4"],
    });
    socket.receive({
      type: "analysis",
      depth: 16,
      multi_pv: 1,
      score: 45,
      pv: ["e2e4"],
    });
    socket.receive({
      type: "analysis",
      depth: 12,
      multi_pv: 2,
      score: 10,
      pv: ["c2c4"],
    });
    socket.receive({ type: "bestmove", bestmove: "e2e4" });

    await expect(result).resolves.toEqual({
      score: 45,
      mate: null,
      depth: 20,
      multiPv: 1,
      pv: [],
      bestmove: "e2e4",
      lines: [
        { score: 45, mate: null, depth: 16, multiPv: 1, pv: ["e2e4"] },
        { score: 20, mate: null, depth: 14, multiPv: 2, pv: ["d2d4"] },
      ],
      completed: true,
    });
    expect(onAnalysis).toHaveBeenCalledTimes(1);
  });

  it("returns partial analysis when Stockfish does not produce a best move in time", async () => {
    vi.useFakeTimers();
    const [engine, socket] = await connectEngine();
    const result = engine.analyzePosition("fen", 14, 1, 100);

    socket.receive({
      type: "analysis",
      depth: 12,
      score: 25,
      pv: ["e2e4"],
    });
    await vi.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toEqual({
      score: 25,
      mate: null,
      depth: 14,
      multiPv: 1,
      pv: [],
      bestmove: null,
      lines: [{ score: 25, mate: null, depth: 12, multiPv: 1, pv: ["e2e4"] }],
      completed: false,
    });
  });
});
