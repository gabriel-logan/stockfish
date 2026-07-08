import { useCallback, useMemo, useRef, useState } from "react";
import {
  FaChartLine,
  FaClipboard,
  FaFastBackward,
  FaFastForward,
  FaStepBackward,
  FaStepForward,
  FaVolumeUp,
} from "react-icons/fa";
import { Chess, type Square } from "chess.js";

import Board from "../components/Board";
import EvaluationBar from "../components/EvaluationBar";
import type { MoveEntry } from "../components/MoveList";
import MoveList from "../components/MoveList";
import { openings } from "../data/openings";
import { useSettingsStore } from "../store/settingsStore";
import { AnalysisEngine, type AnalysisLine } from "../utils/analysisEngine";
import { classifyMove } from "../utils/classification";

function getOpeningName(fen: string): string | null {
  const placement = fen.split(" ")[0];
  const match = openings.find((o) => o.fen === placement);

  return match?.name ?? null;
}

function getMoveUci(move: { from: string; to: string; promotion?: string }) {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

interface PositionData {
  fen: string;
  san?: string;
  color?: "w" | "b";
  from?: string;
  to?: string;
  uci?: string;
  evaluation: number | null;
  mate: number | null;
  bestmove?: string | null;
  lineCount?: number;
  lines?: AnalysisLine[];
  classification?: string;
}

export default function PgnViewer() {
  const [pgnInput, setPgnInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [gameAtIdx, setGameAtIdx] = useState(() => {
    return new Chess();
  });
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(
    null,
  );

  const abortRef = useRef(false);
  const { showEvaluationBar, showMoveEvaluation } = useSettingsStore();

  const moves: MoveEntry[] = positions
    .filter((p): p is PositionData & { san: string; color: "w" | "b" } => {
      return !!p.san && !!p.color;
    })
    .map((p) => {
      return {
        san: p.san,
        fen: p.fen,
        color: p.color,
        from: p.from,
        to: p.to,
        uci: p.uci,
        classification: p.classification,
        evaluation: p.evaluation ?? undefined,
        mate: p.mate ?? undefined,
      };
    });

  const currentEval = positions[currentIdx]?.evaluation ?? null;
  const currentMate = positions[currentIdx]?.mate ?? null;
  const currentFen = positions[currentIdx]?.fen ?? gameAtIdx.fen();
  const reviewPositionLabel =
    positions.length > 0 ? `${currentIdx}/${positions.length - 1}` : "Ready";

  const squareEvaluations = useMemo(() => {
    const evals: Record<string, string> = {};
    const position = positions[currentIdx];

    if (position?.to && position.classification) {
      evals[position.to] = position.classification;
    }

    return evals;
  }, [positions, currentIdx]);

  const openingName = useMemo(() => {
    const fens = positions
      .slice(0, currentIdx + 1)
      .map((position) => position.fen);

    if (fens.length === 0) {
      fens.push(currentFen);
    }

    for (let i = fens.length - 1; i >= 0; i--) {
      const name = getOpeningName(fens[i]);

      if (name) {
        return name;
      }
    }

    return null;
  }, [currentFen, positions, currentIdx]);

  const getGameAtMove = useCallback(
    (posIdx: number): Chess => {
      const g = new Chess();
      if (positions.length === 0) {
        return g;
      }

      const startFen = positions[0]?.fen;
      if (startFen && startFen !== new Chess().fen()) {
        try {
          g.load(startFen);
        } catch {
          /* ignore */
        }
      }

      for (let i = 1; i <= posIdx; i++) {
        const p = positions[i];
        if (p?.san) {
          try {
            g.move(p.san);
          } catch {
            break;
          }
        }
      }
      return g;
    },
    [positions],
  );

  const goToPosition = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= positions.length) {
        return;
      }
      setCurrentIdx(idx);

      const g = getGameAtMove(idx);
      setGameAtIdx(g);

      const hist = g.history({ verbose: true });
      if (hist.length > 0) {
        const last = hist[hist.length - 1];
        setLastMove({ from: last.from as Square, to: last.to as Square });
      } else {
        setLastMove(null);
      }
    },
    [positions, getGameAtMove],
  );

  const handleLoadPgn = async () => {
    if (!pgnInput.trim()) {
      setError("Paste a valid PGN");
      return;
    }

    setError(null);
    setIsAnalyzing(true);
    setProgress(0);
    setCurrentIdx(-1);
    setPositions([]);
    abortRef.current = false;

    try {
      const game = new Chess();
      game.loadPgn(pgnInput);

      const history = game.history({ verbose: true });
      const posData: PositionData[] = [];

      if (history.length > 0) {
        posData.push({ fen: history[0].before, evaluation: null, mate: null });
        for (const move of history) {
          posData.push({
            fen: move.after,
            san: move.san,
            color: move.color as "w" | "b",
            from: move.from,
            to: move.to,
            uci: getMoveUci(move),
            evaluation: null,
            mate: null,
          });
        }
      } else {
        posData.push({ fen: game.fen(), evaluation: null, mate: null });
      }

      setProgress(5);
      setPositions([...posData]);

      const engine = new AnalysisEngine();
      await engine.connect();

      for (let i = 0; i < posData.length; i++) {
        if (abortRef.current) {
          break;
        }

        try {
          const result = await engine.analyzePosition(posData[i].fen, 14, 3);

          posData[i].evaluation = result.score;
          posData[i].mate = result.mate;
          posData[i].bestmove = result.bestmove;
          posData[i].lineCount = result.lines.length;
          posData[i].lines = result.lines;

          const color = posData[i].color;

          if (i > 0 && color) {
            const alternativeLine = posData[i - 1].lines?.find((line) => {
              return line.pv[0] !== posData[i].uci;
            });

            posData[i].classification = classifyMove(
              posData[i - 1].evaluation,
              result.score,
              color,
              posData[i - 1].mate,
              result.mate,
              posData[i - 1].bestmove === posData[i].uci,
              posData[i - 1].lineCount === 1,
              getOpeningName(posData[i].fen) !== null,
              {
                fenBefore: posData[i - 1].fen,
                playedMove: posData[i].uci,
                bestLinePvAfter: result.lines[0]?.pv,
                alternativeEvalBefore: alternativeLine?.score,
                alternativeMateBefore: alternativeLine?.mate,
                fenTwoMovesAgo: posData[i - 2]?.fen ?? null,
                previousMove: posData[i - 1].uci ?? null,
              },
            );
          }

          setProgress(5 + ((i + 1) / posData.length) * 90);
          setPositions([...posData]);
        } catch {
          // Skip failed position
        }
      }

      engine.disconnect();

      setPositions([...posData]);
      setProgress(100);
      setIsAnalyzing(false);

      const initialGame = new Chess();
      initialGame.load(posData[0].fen);
      setCurrentIdx(0);
      setGameAtIdx(initialGame);
      setLastMove(null);
    } catch {
      setError("Invalid PGN. Check the format and try again.");
      setIsAnalyzing(false);
    }
  };

  function computeAccuracy(moveList: MoveEntry[], color: "w" | "b"): string {
    const good = new Set([
      "excellent",
      "best",
      "forced",
      "opening",
      "perfect",
      "splendid",
    ]);

    const playerMoves = moveList.filter((m) => {
      return m.color === color;
    });

    if (playerMoves.length === 0) {
      return "-";
    }

    const goodMoves = playerMoves.filter((m) => {
      return m.classification && good.has(m.classification);
    });

    return ((goodMoves.length / playerMoves.length) * 100).toFixed(1);
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPgnInput(text);
    } catch {
      setError("Cannot access clipboard");
    }
  };

  const iconActionButtonClass =
    "inline-flex min-h-11 w-13 items-center justify-center rounded-md border border-white/8 bg-linear-to-b from-[#3c3a36] to-[#302e2a] text-lg font-extrabold text-[#f4f1e8] shadow-[inset_0_-0.14rem_0_rgb(0_0_0_/_20%)] transition hover:from-[#484640] hover:to-[#383631] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="grid w-[min(100%,108rem)] grid-cols-[minmax(0,1fr)_minmax(20rem,31.25rem)] gap-4 max-[72rem]:grid-cols-1">
      <div className="flex min-w-0 flex-col items-center gap-3">
        {error && (
          <div className="w-[min(100%,50rem)] rounded-md border border-red-300/25 bg-[#5a201c] px-4 py-3 text-center text-sm font-bold text-[#ffd8d4]">
            {error}
          </div>
        )}

        <div className="flex w-[min(100%,50rem)] items-center justify-between gap-3 text-sm font-extrabold text-[#f5f3ed]">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-9 shrink-0 place-items-center rounded border border-white/8 bg-[#3c3935] text-white">
              <FaChartLine aria-hidden="true" />
            </span>
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              Game Review
            </span>
          </div>

          <span>{reviewPositionLabel}</span>
        </div>

        <div className="flex w-full min-w-0 justify-center">
          <div className="flex min-w-0 items-stretch justify-center gap-2 max-[44rem]:gap-1">
            {showEvaluationBar && (
              <EvaluationBar evaluation={currentEval} mate={currentMate} />
            )}

            <Board
              game={gameAtIdx}
              onMove={() => {}}
              selectedSquare={null}
              onSelectSquare={() => {}}
              lastMove={lastMove}
              squareEvaluations={squareEvaluations}
              showEvaluationIcons={showMoveEvaluation}
            />
          </div>
        </div>

        <div className="flex justify-center gap-2 rounded-md border border-[#accc821a] bg-[#1d211d] p-2">
          <button
            type="button"
            className={iconActionButtonClass}
            onClick={() => {
              goToPosition(0);
            }}
            disabled={currentIdx <= 0}
            title="First move"
          >
            <FaFastBackward aria-hidden="true" />
          </button>

          <button
            type="button"
            className={iconActionButtonClass}
            onClick={() => {
              goToPosition(currentIdx - 1);
            }}
            disabled={currentIdx <= 0}
            title="Previous move"
          >
            <FaStepBackward aria-hidden="true" />
          </button>

          <button
            type="button"
            className={iconActionButtonClass}
            onClick={() => {
              goToPosition(currentIdx + 1);
            }}
            disabled={currentIdx >= positions.length - 1}
            title="Next move"
          >
            <FaStepForward aria-hidden="true" />
          </button>

          <button
            type="button"
            className={iconActionButtonClass}
            onClick={() => {
              goToPosition(positions.length - 1);
            }}
            disabled={currentIdx >= positions.length - 1}
            title="Last move"
          >
            <FaFastForward aria-hidden="true" />
          </button>
        </div>

        {positions.length === 0 && !isAnalyzing && (
          <div className="px-4 py-8 text-center text-[0.95rem] leading-relaxed text-[#aaa7a0]">
            Paste a PGN and click Analyze to review the game.
          </div>
        )}

        <div className="flex min-h-8 items-center gap-2 rounded-md border border-white/7 bg-black/20 px-3 text-xs font-bold text-[#cbc8c0]">
          Opening
          <strong>{openingName ?? "not detected yet"}</strong>
        </div>
      </div>

      <aside className="flex min-h-[calc(100vh-2.5rem)] flex-col overflow-hidden rounded-lg border border-[#accc821a] bg-[#22251f] shadow-[0_1rem_2.5rem_rgb(0_0_0_/_20%)] max-[72rem]:min-h-0">
        <div className="flex min-h-13 items-center justify-between border-b border-[#accc821a] bg-linear-to-br from-[#1f241f] to-[#20211e] px-4 text-base font-extrabold text-white">
          <span>PGN Analysis</span>
          <button
            type="button"
            className="grid size-9 place-items-center rounded bg-transparent text-[#aaa7a0] transition-colors hover:bg-white/7 hover:text-white"
            title="Sound"
          >
            <FaVolumeUp aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-md border border-white/6 bg-[#242321] p-4">
          <div className="flex items-center justify-between gap-3">
            <label className="text-base font-black text-white">Paste PGN</label>

            <button
              type="button"
              className="inline-flex min-h-8 items-center justify-center gap-1 rounded border border-white/8 bg-[#36342f] px-3 text-xs font-extrabold text-[#dcd8cf] transition-colors hover:bg-[#424039] hover:text-white"
              onClick={handlePaste}
            >
              <FaClipboard aria-hidden="true" />
              Paste
            </button>
          </div>

          <textarea
            className="min-h-36 w-full resize-y rounded border border-white/10 bg-[#373530] p-3 font-mono text-sm leading-relaxed text-[#ebe8df] outline-none placeholder:text-[#8f8b84] focus:border-[#9ac45c] focus:ring-3 focus:ring-[#9ac45c2e]"
            placeholder="e.g. 1. e4 e5 2. Nf3 Nc6 ..."
            value={pgnInput}
            onChange={(e) => {
              setPgnInput(e.target.value);
            }}
          />

          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/8 bg-linear-to-br from-[#7fa64c] to-[#4f8468] px-4 text-sm font-extrabold text-white shadow-[inset_0_-0.14rem_0_rgb(0_0_0_/_20%)] transition hover:from-[#8bb75a] hover:to-[#5b9476] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleLoadPgn}
            disabled={isAnalyzing || !pgnInput.trim()}
          >
            {isAnalyzing ? "Analyzing..." : "Analyze"}
          </button>
        </div>

        <div className="border-b border-white/6 p-4">
          <h2 className="mb-3 text-xs font-extrabold text-[#aaa7a0] uppercase">
            Opening
          </h2>

          <div className="rounded-md border border-white/6 bg-[#302e2a] p-3 text-sm font-bold text-[#f5f3ed]">
            {openingName ?? "No book match for this position yet"}
          </div>
        </div>

        {isAnalyzing && (
          <div className="px-4 pb-4">
            <div className="h-2 overflow-hidden rounded-full bg-[#171614]">
              <div
                className="h-full bg-[#86a94f] transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-center text-xs font-extrabold text-[#aaa7a0]">
              {Math.round(progress)}%
            </p>
          </div>
        )}

        {positions.length > 0 && !isAnalyzing && (
          <>
            <div className="min-h-48 flex-1 overflow-hidden border-b border-white/6 p-4">
              <h2 className="mb-3 text-xs font-extrabold text-[#aaa7a0] uppercase">
                Moves
              </h2>

              <MoveList
                moves={moves}
                currentMoveIndex={currentIdx - 1}
                onGoToMove={(idx) => {
                  goToPosition(idx + 1);
                }}
                showEvaluation={showMoveEvaluation}
              />
            </div>

            <div className="border-b border-white/6 p-4">
              <h2 className="mb-3 text-xs font-extrabold text-[#aaa7a0] uppercase">
                Accuracy
              </h2>

              <div className="grid grid-cols-2 gap-3 max-[44rem]:grid-cols-1">
                <div className="min-h-18 rounded-md border border-white/6 bg-[#302e2a] p-3">
                  <div className="text-xs font-extrabold text-[#aaa7a0] uppercase">
                    White
                  </div>
                  <div className="mt-1 text-2xl font-black text-white">
                    {computeAccuracy(moves, "w")}%
                  </div>
                </div>

                <div className="min-h-18 rounded-md border border-white/6 bg-[#302e2a] p-3">
                  <div className="text-xs font-extrabold text-[#aaa7a0] uppercase">
                    Black
                  </div>
                  <div className="mt-1 text-2xl font-black text-white">
                    {computeAccuracy(moves, "b")}%
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
