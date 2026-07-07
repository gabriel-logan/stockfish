import { useCallback, useEffect, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";

import Board from "../components/Board";
import EvaluationBar from "../components/EvaluationBar";
import type { MoveEntry } from "../components/MoveList";
import MoveList from "../components/MoveList";
import { useSettingsStore } from "../store/settingsStore";
import { AnalysisEngine } from "../utils/analysisEngine";
import { classifyMove } from "../utils/classification";
import { ELO_LEVELS, getSkillLevel } from "../utils/elo";

export default function PlayComputer() {
  const [game, setGame] = useState(() => {
    return new Chess();
  });
  const gameRef = useRef(game);
  const engineRef = useRef<AnalysisEngine | null>(null);

  const isEngineRunning = useRef(false);
  const prevEvalRef = useRef<number | null>(null);
  const evaluationRef = useRef<number | null>(null);
  const movesRef = useRef<MoveEntry[]>([]);

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(
    null,
  );
  const [moves, setMoves] = useState<MoveEntry[]>([]);
  const [evaluation, setEvaluation] = useState<number | null>(null);
  const [mate, setMate] = useState<number | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    showEvaluationBar,
    botElo,
    playerColor,
    setPlayerColor,
    setShowEvaluationBar,
    setBotElo,
  } = useSettingsStore();

  const computerColor = playerColor === "w" ? "b" : "w";

  const computerColorRef = useRef(computerColor);
  const playerColorRef = useRef(playerColor);
  const botEloRef = useRef(botElo);

  useEffect(() => {
    computerColorRef.current = computerColor;
  }, [computerColor]);
  useEffect(() => {
    playerColorRef.current = playerColor;
  }, [playerColor]);
  useEffect(() => {
    botEloRef.current = botElo;
  }, [botElo]);
  useEffect(() => {
    evaluationRef.current = evaluation;
  }, [evaluation]);

  const syncMoves = useCallback((newMoves: MoveEntry[]) => {
    movesRef.current = newMoves;
    setMoves(newMoves);
  }, []);

  // Setup AnalysisEngine (WebSocket)
  useEffect(() => {
    const engine = new AnalysisEngine();
    engineRef.current = engine;

    engine.onReady = () => {
      if (
        gameRef.current.turn() === computerColorRef.current &&
        !gameRef.current.isGameOver()
      ) {
        const skill = getSkillLevel(botEloRef.current);
        engine.setSkillLevel(skill);
        engine.startAnalysis(gameRef.current.fen(), 0, 1);
        isEngineRunning.current = true;
        setIsThinking(true);
      }
    };

    engine.onAnalysis = (data) => {
      evaluationRef.current = data.score;
      setEvaluation(data.score);
      setMate(data.mate);
    };

    engine.onBestMove = (data) => {
      isEngineRunning.current = false;
      setIsThinking(false);

      if (!data.bestmove || data.bestmove === "(none)") {
        setIsGameOver(true);
        return;
      }

      // Classify player's last unclassified move
      const currentMoves = movesRef.current;
      if (currentMoves.length > 0) {
        const last = currentMoves[currentMoves.length - 1];
        if (last.color === playerColorRef.current && !last.classification) {
          const classification = classifyMove(
            prevEvalRef.current,
            evaluationRef.current,
            last.color,
          );
          currentMoves[currentMoves.length - 1] = {
            ...last,
            classification,
            evaluation: evaluationRef.current ?? undefined,
          };
          syncMoves([...currentMoves]);
        }
      }

      // Play computer's move
      if (
        gameRef.current.turn() !== computerColorRef.current ||
        gameRef.current.isGameOver()
      ) {
        return;
      }

      try {
        const move = gameRef.current.move(data.bestmove);

        if (!move) {
          return;
        }

        setLastMove({ from: move.from as Square, to: move.to as Square });

        const entry: MoveEntry = {
          san: move.san,
          fen: gameRef.current.fen(),
          color: move.color as "w" | "b",
        };
        syncMoves([...movesRef.current, entry]);
        setIsGameOver(gameRef.current.isGameOver());
      } catch {
        // Invalid move from engine
      }
    };

    engine.onError = (msg) => {
      setError(msg);
    };

    engine.onDisconnect = () => {
      setConnected(false);
      setError("Connection lost");
    };

    engine
      .connect()
      .then(() => {
        setConnected(true);
      })
      .catch((err) => {
        setError(err.message);
      });

    return () => {
      engine.disconnect();
      engineRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When WebSocket connects and it's computer's turn, start analysis
  useEffect(() => {
    const engine = engineRef.current;

    if (!engine?.connected) {
      return;
    }

    if (gameRef.current.isGameOver()) {
      return;
    }

    if (gameRef.current.turn() !== computerColorRef.current) {
      return;
    }

    const skill = getSkillLevel(botEloRef.current);
    engine.setSkillLevel(skill);
    engine.startAnalysis(gameRef.current.fen(), 0, 1);
    isEngineRunning.current = true;
    setIsThinking(true);
  }, [connected]);

  const handlePlayerMove = useCallback(
    (from: Square, to: Square) => {
      if (gameRef.current.turn() !== playerColor) {
        return;
      }

      if (isEngineRunning.current) {
        return;
      }

      if (gameRef.current.isGameOver()) {
        return;
      }

      try {
        prevEvalRef.current = evaluationRef.current;

        const move = gameRef.current.move({ from, to, promotion: "q" });

        if (!move) {
          return;
        }

        setLastMove({ from: move.from as Square, to: move.to as Square });

        const entry: MoveEntry = {
          san: move.san,
          fen: gameRef.current.fen(),
          color: move.color as "w" | "b",
        };
        syncMoves([...movesRef.current, entry]);

        if (gameRef.current.isGameOver()) {
          setIsGameOver(true);
          return;
        }

        // Start engine analysis to evaluate position and find response
        const engine = engineRef.current;
        if (engine?.connected) {
          const skill = getSkillLevel(botElo);
          engine.setSkillLevel(skill);
          engine.startAnalysis(gameRef.current.fen(), 0, 1);
          isEngineRunning.current = true;
          setIsThinking(true);
        }
      } catch {
        // Invalid move
      }
    },
    [playerColor, botElo, syncMoves],
  );

  const newGame = useCallback(() => {
    const engine = engineRef.current;
    if (engine?.connected) {
      engine.stopAnalysis();
    }

    const newChess = new Chess();
    gameRef.current = newChess;
    setGame(newChess);

    prevEvalRef.current = null;
    evaluationRef.current = null;
    syncMoves([]);
    setSelectedSquare(null);
    setLastMove(null);
    setEvaluation(null);
    setMate(null);
    setIsGameOver(false);
    setError(null);

    if (
      engine?.connected &&
      gameRef.current.turn() === computerColorRef.current
    ) {
      const skill = getSkillLevel(botEloRef.current);
      engine.setSkillLevel(skill);
      engine.startAnalysis(gameRef.current.fen(), 0, 1);
      isEngineRunning.current = true;
      setIsThinking(true);
    }
  }, [syncMoves]);

  return (
    <div className="flex w-full max-w-6xl flex-col items-center gap-4">
      {error && (
        <div className="w-full max-w-3xl rounded bg-red-900/80 px-4 py-2 text-center text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-4 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Play as:</label>
          <select
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-200"
            value={playerColor}
            onChange={(e) => {
              setPlayerColor(e.target.value as "w" | "b");
            }}
          >
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Bot level:</label>
          <select
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-200"
            value={botElo}
            onChange={(e) => {
              setBotElo(Number(e.target.value));
            }}
          >
            {ELO_LEVELS.map((level) => {
              return (
                <option key={level.elo} value={level.elo}>
                  {level.label}
                </option>
              );
            })}
          </select>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-400">
          <input
            type="checkbox"
            checked={showEvaluationBar}
            onChange={(e) => {
              setShowEvaluationBar(e.target.checked);
            }}
            className="h-4 w-4"
          />
          Eval bar
        </label>

        <button
          type="button"
          className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-600"
          onClick={newGame}
        >
          New game
        </button>
      </div>

      <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start">
        <div className="flex gap-3">
          <Board
            game={game}
            onMove={handlePlayerMove}
            selectedSquare={selectedSquare}
            onSelectSquare={setSelectedSquare}
            lastMove={lastMove}
            orientation={playerColor}
          />

          {showEvaluationBar && (
            <EvaluationBar evaluation={evaluation} mate={mate} height={484} />
          )}
        </div>
      </div>

      {isThinking && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
          Thinking...
        </div>
      )}

      {isGameOver && (
        <div className="rounded bg-gray-800 px-4 py-2 text-sm text-gray-300">
          Game over.{" "}
          <button
            type="button"
            className="text-blue-400 underline hover:text-blue-300"
            onClick={newGame}
          >
            New game
          </button>
        </div>
      )}

      <div className="w-full max-w-md">
        <MoveList
          moves={moves}
          currentMoveIndex={moves.length - 1}
          onGoToMove={() => {}}
        />
      </div>
    </div>
  );
}
