import { useCallback, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";

import Board from "../components/Board";
import EvaluationBar from "../components/EvaluationBar";
import type { MoveEntry } from "../components/MoveList";
import MoveList from "../components/MoveList";
import { useSettingsStore } from "../store/settingsStore";
import { AnalysisEngine } from "../utils/analysisEngine";
import { classifyMove } from "../utils/classification";

interface PositionData {
  fen: string;
  san?: string;
  color?: "w" | "b";
  evaluation: number | null;
  mate: number | null;
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
  const { showEvaluationBar } = useSettingsStore();

  const moves: MoveEntry[] = positions
    .filter((p): p is PositionData & { san: string; color: "w" | "b" } => {
      return !!p.san && !!p.color;
    })
    .map((p) => {
      return {
        san: p.san,
        fen: p.fen,
        color: p.color,
        classification: p.classification,
        evaluation: p.evaluation ?? undefined,
        mate: p.mate ?? undefined,
      };
    });

  const currentEval = positions[currentIdx]?.evaluation ?? null;
  const currentMate = positions[currentIdx]?.mate ?? null;

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
          const result = await engine.analyzePosition(posData[i].fen, 14);

          posData[i].evaluation = result.score;
          posData[i].mate = result.mate;

          const color = posData[i].color;

          if (
            i > 0 &&
            posData[i - 1].evaluation !== null &&
            result.score !== null &&
            color
          ) {
            posData[i].classification = classifyMove(
              posData[i - 1].evaluation,
              result.score,
              color,
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
      goToPosition(0);
    } catch {
      setError("Invalid PGN. Check the format and try again.");
      setIsAnalyzing(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPgnInput(text);
    } catch {
      setError("Cannot access clipboard");
    }
  };

  return (
    <div className="flex w-full max-w-6xl flex-col items-center gap-4">
      <div className="w-full max-w-2xl">
        <div className="mb-2 flex items-center gap-2">
          <label className="text-sm font-medium text-gray-300">
            Paste PGN:
          </label>
          <button
            type="button"
            className="text-xs text-blue-400 hover:text-blue-300"
            onClick={handlePaste}
          >
            Paste
          </button>
        </div>

        <textarea
          className="h-28 w-full rounded border border-gray-700 bg-gray-900 p-3 font-mono text-sm text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
          placeholder="e.g. 1. e4 e5 2. Nf3 Nc6 ..."
          value={pgnInput}
          onChange={(e) => {
            setPgnInput(e.target.value);
          }}
        />

        <button
          type="button"
          className="mt-2 rounded bg-blue-700 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
          onClick={handleLoadPgn}
          disabled={isAnalyzing || !pgnInput.trim()}
        >
          {isAnalyzing ? "Analyzing..." : "Analyze"}
        </button>
      </div>

      {isAnalyzing && (
        <div className="w-full max-w-md">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-center text-xs text-gray-500">
            {Math.round(progress)}%
          </p>
        </div>
      )}

      {error && (
        <div className="rounded bg-red-900/80 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {positions.length > 0 && !isAnalyzing && (
        <>
          <div className="flex gap-3">
            <Board
              game={gameAtIdx}
              onMove={() => {}}
              selectedSquare={null}
              onSelectSquare={() => {}}
              lastMove={lastMove}
            />

            {showEvaluationBar && (
              <EvaluationBar
                evaluation={currentEval}
                mate={currentMate}
                height={484}
              />
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-30"
              onClick={() => {
                goToPosition(0);
              }}
              disabled={currentIdx <= 0}
            >
              {"⏮"}
            </button>

            <button
              type="button"
              className="rounded bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-30"
              onClick={() => {
                goToPosition(currentIdx - 1);
              }}
              disabled={currentIdx <= 0}
            >
              {"◀"}
            </button>

            <span className="min-w-[80px] text-center text-sm text-gray-400">
              {currentIdx}/{positions.length - 1}
            </span>

            <button
              type="button"
              className="rounded bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-30"
              onClick={() => {
                goToPosition(currentIdx + 1);
              }}
              disabled={currentIdx >= positions.length - 1}
            >
              {"▶"}
            </button>

            <button
              type="button"
              className="rounded bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-30"
              onClick={() => {
                goToPosition(positions.length - 1);
              }}
              disabled={currentIdx >= positions.length - 1}
            >
              {"⏭"}
            </button>
          </div>

          <div className="w-full max-w-md">
            <MoveList
              moves={moves}
              currentMoveIndex={currentIdx - 1}
              onGoToMove={(idx) => {
                goToPosition(idx + 1);
              }}
            />
          </div>
        </>
      )}

      {positions.length === 0 && !isAnalyzing && (
        <div className="py-12 text-center text-gray-500">
          Paste a PGN and click "Analyze" to review the game
        </div>
      )}
    </div>
  );
}
