import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FaClipboard,
  FaRedo,
  FaRobot,
  FaUndo,
  FaUser,
  FaVolumeOff,
  FaVolumeUp,
} from "react-icons/fa";
import { toast } from "react-toastify";
import { Chess, type Square } from "chess.js";

import Board from "../components/Board";
import EvaluationBar from "../components/EvaluationBar";
import type { MoveEntry } from "../components/MoveList";
import MoveList from "../components/MoveList";
import { openings } from "../data/openings";
import {
  PIECE_SETS,
  type PieceSet,
  useSettingsStore,
} from "../store/settingsStore";
import { type SavedGame, useUserStore } from "../store/userStore";
import { AnalysisEngine } from "../utils/analysisEngine";
import { classifyMove } from "../utils/classification";
import { UCI_ELO_MAX, UCI_ELO_MIN } from "../utils/elo";
import {
  playCaptureSound,
  playGameOverSound,
  playMoveSound,
} from "../utils/sounds";

const BOT_MOVE_DELAY_MS = 1200;

function getOpeningName(fen: string): string | null {
  const placement = fen.split(" ")[0];
  const match = openings.find((o) => o.fen === placement);

  return match?.name ?? null;
}

function getMoveUci(move: { from: string; to: string; promotion?: string }) {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export default function PlayComputer() {
  const [game, setGame] = useState(() => {
    return new Chess();
  });
  const gameRef = useRef(game);
  const playEngineRef = useRef<AnalysisEngine | null>(null);
  const evalEngineRef = useRef<AnalysisEngine | null>(null);

  const isEngineRunning = useRef(false);
  const prevEvalRef = useRef<number | null>(null);
  const evaluationRef = useRef<number | null>(null);
  const movesRef = useRef<MoveEntry[]>([]);
  const analysisVersionRef = useRef(0);
  const evalQueueRef = useRef<Promise<void>>(Promise.resolve());
  const botMoveTimeoutRef = useRef<number | null>(null);

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
  const [boardFlipped, setBoardFlipped] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [savedGameId, setSavedGameId] = useState<string | null>(null);

  const activeUserId = useUserStore((s) => s.activeUserId);
  const saveGameToStore = useUserStore((s) => s.saveGame);

  const {
    showEvaluationBar,
    showMoveEvaluation,
    soundEnabled,
    botElo,
    playerColor,
    pieceSet,
    setPlayerColor,
    setPieceSet,
    setShowEvaluationBar,
    setShowMoveEvaluation,
    setSoundEnabled,
    setBotElo,
  } = useSettingsStore();

  const computerColor = playerColor === "w" ? "b" : "w";

  const computerColorRef = useRef(computerColor);
  const playerColorRef = useRef(playerColor);
  const botEloRef = useRef(botElo);
  const soundEnabledRef = useRef(soundEnabled);
  const gameStartedRef = useRef(gameStarted);

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
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);
  useEffect(() => {
    gameStartedRef.current = gameStarted;
  }, [gameStarted]);
  useEffect(() => {
    evaluationRef.current = evaluation;
  }, [evaluation]);

  const syncMoves = useCallback((newMoves: MoveEntry[]) => {
    movesRef.current = newMoves;
    setMoves(newMoves);
  }, []);

  const clearPendingBotMove = useCallback(() => {
    if (botMoveTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(botMoveTimeoutRef.current);
    botMoveTimeoutRef.current = null;
  }, []);

  const classifyLastMove = useCallback(
    async (moveIndex: number, fenBefore: string, version: number) => {
      const evalEngine = evalEngineRef.current;
      const moveEntry = movesRef.current[moveIndex];

      if (!evalEngine?.connected || !moveEntry) {
        return null;
      }

      const previousEvalTask = evalQueueRef.current;
      let releaseEvalTask = () => {};

      evalQueueRef.current = previousEvalTask.then(() => {
        return new Promise<void>((resolve) => {
          releaseEvalTask = resolve;
        });
      });

      await previousEvalTask;

      try {
        const before = await evalEngine.analyzePosition(fenBefore, 14, 3);

        if (analysisVersionRef.current !== version) {
          return null;
        }

        const after = await evalEngine.analyzePosition(moveEntry.fen, 14);

        if (analysisVersionRef.current !== version) {
          return null;
        }

        const alternativeLine = before.lines.find((line) => {
          return line.pv[0] !== moveEntry.uci;
        });

        const classification = classifyMove(
          before.score,
          after.score,
          moveEntry.color,
          before.mate,
          after.mate,
          before.bestmove === moveEntry.uci,
          before.lines.length === 1,
          getOpeningName(moveEntry.fen) !== null,
          {
            fenBefore,
            playedMove: moveEntry.uci,
            bestLinePvAfter: after.lines[0]?.pv,
            alternativeEvalBefore: alternativeLine?.score,
            alternativeMateBefore: alternativeLine?.mate,
            fenTwoMovesAgo: movesRef.current[moveIndex - 2]?.fen ?? null,
            previousMove: movesRef.current[moveIndex - 1]?.uci ?? null,
          },
        );

        const nextMoves = [...movesRef.current];
        const currentEntry = nextMoves[moveIndex];

        if (!currentEntry) {
          return after.score;
        }

        nextMoves[moveIndex] = {
          ...currentEntry,
          classification,
          evaluation: after.score ?? undefined,
          mate: after.mate ?? undefined,
        };

        syncMoves(nextMoves);
        evaluationRef.current = after.score;
        setEvaluation(after.score);
        setMate(after.mate);
        prevEvalRef.current = after.score;

        return after.score;
      } finally {
        releaseEvalTask();
      }
    },
    [syncMoves],
  );

  // Setup engines (one plays, one evaluates at full strength)
  useEffect(() => {
    const playEngine = new AnalysisEngine();
    const evalEngine = new AnalysisEngine();

    playEngineRef.current = playEngine;
    evalEngineRef.current = evalEngine;

    playEngine.onReady = () => {
      if (
        gameStartedRef.current &&
        gameRef.current.turn() === computerColorRef.current &&
        !gameRef.current.isGameOver()
      ) {
        playEngine.setElo(botEloRef.current);
        playEngine.startAnalysis(gameRef.current.fen(), 14, 1);
        isEngineRunning.current = true;
        setIsThinking(true);
      }
    };

    evalEngine.onReady = () => {
      evalEngine.setFullStrength();
      evalEngine.startAnalysis(gameRef.current.fen(), 14, 1);
    };

    evalEngine.onAnalysis = (data) => {
      evaluationRef.current = data.score;
      setEvaluation(data.score);
      setMate(data.mate);
    };

    playEngine.onBestMove = (data) => {
      if (!gameStartedRef.current || !isEngineRunning.current) {
        return;
      }

      if (!data.bestmove || data.bestmove === "(none)") {
        isEngineRunning.current = false;
        setIsThinking(false);
        setIsGameOver(true);

        if (soundEnabledRef.current) {
          playGameOverSound();
        }

        return;
      }

      // Play computer's move
      if (
        gameRef.current.turn() !== computerColorRef.current ||
        gameRef.current.isGameOver()
      ) {
        isEngineRunning.current = false;
        setIsThinking(false);
        return;
      }

      const bestMove = data.bestmove;
      const version = analysisVersionRef.current;

      clearPendingBotMove();
      setIsThinking(true);

      botMoveTimeoutRef.current = window.setTimeout(() => {
        botMoveTimeoutRef.current = null;

        if (analysisVersionRef.current !== version) {
          return;
        }

        isEngineRunning.current = false;
        setIsThinking(false);

        if (
          gameRef.current.turn() !== computerColorRef.current ||
          gameRef.current.isGameOver()
        ) {
          return;
        }

        try {
          const fenBefore = gameRef.current.fen();
          const move = gameRef.current.move(bestMove);

          if (!move) {
            const engine = playEngineRef.current;

            if (
              engine?.connected &&
              gameStartedRef.current &&
              gameRef.current.turn() === computerColorRef.current &&
              !gameRef.current.isGameOver()
            ) {
              engine.setElo(botEloRef.current);
              engine.startAnalysis(gameRef.current.fen(), 14, 1);
              isEngineRunning.current = true;
              setIsThinking(true);
            }

            return;
          }

          setLastMove({ from: move.from as Square, to: move.to as Square });

          const entry: MoveEntry = {
            san: move.san,
            fen: gameRef.current.fen(),
            color: move.color as "w" | "b",
            from: move.from,
            to: move.to,
            uci: getMoveUci(move),
          };
          const nextMoves = [...movesRef.current, entry];
          const moveIndex = nextMoves.length - 1;

          syncMoves(nextMoves);

          const gameOver = gameRef.current.isGameOver();
          setIsGameOver(gameOver);
          void classifyLastMove(moveIndex, fenBefore, version);

          if (soundEnabledRef.current) {
            if (gameOver) {
              playGameOverSound();
            } else if (move.captured) {
              playCaptureSound();
            } else {
              playMoveSound();
            }
          }
        } catch {
          // Invalid move from engine
        }
      }, BOT_MOVE_DELAY_MS);
    };

    playEngine.onError = (msg) => {
      setError(msg);
      toast.error(msg);
    };

    evalEngine.onError = (msg) => {
      setError(msg);
      toast.error(msg);
    };

    playEngine.onDisconnect = () => {
      setConnected(false);
      setError("Connection lost");
      toast.error("Play engine disconnected");
    };

    evalEngine.onDisconnect = () => {
      setConnected(false);
      setError("Evaluation connection lost");
      toast.error("Evaluation engine disconnected");
    };

    Promise.all([playEngine.connect(), evalEngine.connect()])
      .then(() => {
        setConnected(true);
        toast.success("Engines connected");
      })
      .catch((err: Error) => {
        setError(err.message);
        toast.error(`Connection failed: ${err.message}`);
      });

    return () => {
      clearPendingBotMove();
      playEngine.disconnect();
      evalEngine.disconnect();
      playEngineRef.current = null;
      evalEngineRef.current = null;
    };
  }, [classifyLastMove, clearPendingBotMove, syncMoves]);

  /*
    Keep a dedicated connection for playing moves and a separate full-strength
    connection for evaluations/classifications so low-skill Stockfish moves can
    be judged honestly.
  */
  useEffect(() => {
    const evalEngine = evalEngineRef.current;

    if (!evalEngine?.connected) {
      return;
    }

    evalEngine.setFullStrength();
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
        const fenBefore = gameRef.current.fen();
        const version = analysisVersionRef.current;

        const move = gameRef.current.move({ from, to, promotion: "q" });

        if (!move) {
          return;
        }

        if (!gameStartedRef.current) {
          gameStartedRef.current = true;
          setGameStarted(true);
        }

        setLastMove({ from: move.from as Square, to: move.to as Square });

        const entry: MoveEntry = {
          san: move.san,
          fen: gameRef.current.fen(),
          color: move.color as "w" | "b",
          from: move.from,
          to: move.to,
          uci: getMoveUci(move),
        };
        const nextMoves = [...movesRef.current, entry];
        const moveIndex = nextMoves.length - 1;

        syncMoves(nextMoves);
        void classifyLastMove(moveIndex, fenBefore, version);

        if (soundEnabledRef.current) {
          if (move.captured) {
            playCaptureSound();
          } else {
            playMoveSound();
          }
        }

        if (gameRef.current.isGameOver()) {
          setIsGameOver(true);

          if (soundEnabledRef.current) {
            playGameOverSound();
          }

          return;
        }

        const engine = playEngineRef.current;
        if (engine?.connected) {
          engine.setElo(botElo);
          engine.startAnalysis(gameRef.current.fen(), 14, 1);
          isEngineRunning.current = true;
          setIsThinking(true);
        }
      } catch {
        // Invalid move
      }
    },
    [playerColor, botElo, syncMoves, classifyLastMove],
  );

  const effectiveOrientation = useMemo(() => {
    if (boardFlipped) {
      return playerColor === "w" ? "b" : "w";
    }
    return playerColor;
  }, [boardFlipped, playerColor]);

  const squareEvaluations = useMemo(() => {
    const evals: Record<string, string> = {};
    const move = moves[moves.length - 1];

    if (move?.to && move.classification) {
      evals[move.to] = move.classification;
    }

    return evals;
  }, [moves]);

  const currentFen = game.fen();

  const openingName = useMemo(() => {
    const fens = moves.map((move) => move.fen);
    fens.push(currentFen);

    for (let i = fens.length - 1; i >= 0; i--) {
      const name = getOpeningName(fens[i]);

      if (name) {
        return name;
      }
    }

    return null;
  }, [currentFen, moves]);

  const playerLabel = playerColor === "w" ? "White" : "Black";
  const botLabel = computerColor === "w" ? "White" : "Black";

  const undoLastMove = useCallback(() => {
    if (gameRef.current.isGameOver()) {
      return;
    }

    analysisVersionRef.current += 1;
    clearPendingBotMove();

    const playEngine = playEngineRef.current;
    const evalEngine = evalEngineRef.current;

    if (playEngine?.connected && isEngineRunning.current) {
      playEngine.stopAnalysis();
      isEngineRunning.current = false;
      setIsThinking(false);
    }

    if (evalEngine?.connected) {
      evalEngine.stopAnalysis();
    }

    const currentMoves = movesRef.current;

    if (currentMoves.length === 0) {
      return;
    }

    const undoCount = currentMoves.length >= 2 ? 2 : 1;

    for (let i = 0; i < undoCount; i++) {
      gameRef.current.undo();
    }

    const newMoves = currentMoves.slice(0, currentMoves.length - undoCount);
    syncMoves(newMoves);

    if (newMoves.length > 0) {
      const prevMove = newMoves[newMoves.length - 1];
      evaluationRef.current = prevMove.evaluation ?? null;
      setEvaluation(prevMove.evaluation ?? null);
      setMate(prevMove.mate ?? null);
      prevEvalRef.current = prevMove.evaluation ?? null;
    } else {
      evaluationRef.current = null;
      setEvaluation(null);
      setMate(null);
      prevEvalRef.current = null;
    }

    const hist = gameRef.current.history({ verbose: true });
    if (hist.length > 0) {
      const last = hist[hist.length - 1];
      setLastMove({ from: last.from as Square, to: last.to as Square });
    } else {
      setLastMove(null);
    }

    setIsGameOver(false);
    setSelectedSquare(null);

    if (evalEngine?.connected) {
      evalEngine.setFullStrength();
      evalEngine.startAnalysis(gameRef.current.fen(), 14, 1);
    }
  }, [syncMoves, clearPendingBotMove]);

  const copyPgn = useCallback(() => {
    const pgn = gameRef.current.pgn();
    navigator.clipboard
      .writeText(pgn)
      .then(() => {
        toast.success("PGN copied to clipboard");
      })
      .catch(() => {});
  }, []);

  const toggleBoard = useCallback(() => {
    setBoardFlipped((prev) => !prev);
  }, []);

  const saveCurrentGame = useCallback(() => {
    if (savedGameId || !activeUserId) {
      return;
    }

    const pgn = gameRef.current.pgn();
    const result = gameRef.current.isCheckmate()
      ? gameRef.current.turn() === "w"
        ? "0-1"
        : "1-0"
      : gameRef.current.isDraw()
        ? "1/2-1/2"
        : "*";

    const savedGame: SavedGame = {
      id: crypto.randomUUID(),
      pgn,
      date: new Date().toISOString(),
      result,
      opponent: `Stockfish (${botEloRef.current} Elo)`,
      opening: openingName ?? undefined,
      playerColor,
      botElo: botEloRef.current,
      moves: movesRef.current.length,
    };

    saveGameToStore(savedGame);
    setSavedGameId(savedGame.id);
    toast.success("Game saved");
  }, [activeUserId, savedGameId, openingName, playerColor, saveGameToStore]);

  const handleStartGame = useCallback(() => {
    gameStartedRef.current = true;
    setGameStarted(true);

    // If it's the bot's turn, start analysis immediately
    if (
      gameRef.current.turn() === computerColorRef.current &&
      !gameRef.current.isGameOver()
    ) {
      const engine = playEngineRef.current;

      if (engine?.connected) {
        engine.setElo(botEloRef.current);
        engine.startAnalysis(gameRef.current.fen(), 14, 1);
        isEngineRunning.current = true;
        setIsThinking(true);
      }
    }
  }, []);

  const newGame = useCallback(() => {
    analysisVersionRef.current += 1;
    clearPendingBotMove();
    isEngineRunning.current = false;
    gameStartedRef.current = false;
    evalQueueRef.current = Promise.resolve();

    const playEngine = playEngineRef.current;
    const evalEngine = evalEngineRef.current;

    if (playEngine?.connected) {
      playEngine.stopAnalysis();
    }

    if (evalEngine?.connected) {
      evalEngine.stopAnalysis();
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
    setGameStarted(false);
    setIsGameOver(false);
    setIsThinking(false);
    setError(null);

    if (evalEngine?.connected) {
      evalEngine.setFullStrength();
      evalEngine.startAnalysis(newChess.fen(), 14, 1);
    }
  }, [syncMoves, clearPendingBotMove]);

  const iconActionButtonClass =
    "inline-flex min-h-11 items-center justify-center rounded-md border border-white/8 bg-linear-to-b from-[#3c3a36] to-[#302e2a] p-0 text-lg font-extrabold text-[#f4f1e8] shadow-[inset_0_-0.14rem_0_rgb(0_0_0_/_20%)] transition hover:from-[#484640] hover:to-[#383631] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="grid w-[min(100%,108rem)] grid-cols-[minmax(0,1fr)_minmax(20rem,31.25rem)] gap-4 max-[72rem]:grid-cols-1">
      {isThinking && (
        <div className="absolute top-5 flex min-h-8 items-center gap-2 rounded-md border border-white/7 bg-black/20 px-3 text-xs font-bold text-[#cbc8c0]">
          <span className="size-2 animate-pulse rounded-full bg-[#f7c948]" />
          Thinking...
        </div>
      )}

      <div className="flex min-w-0 flex-col items-center gap-3">
        {error && (
          <div className="w-[min(100%,50rem)] rounded-md border border-red-300/25 bg-[#5a201c] px-4 py-3 text-center text-sm font-bold text-[#ffd8d4]">
            {error}
          </div>
        )}

        {isGameOver && (
          <div className="flex min-h-8 flex-wrap items-center gap-2 rounded-md border border-white/7 bg-black/20 px-3 text-xs font-bold text-[#cbc8c0]">
            Game over.
            <button
              type="button"
              className="inline-flex min-h-8 items-center justify-center rounded border border-white/8 bg-[#36342f] px-3 text-xs font-extrabold text-[#dcd8cf] transition-colors hover:bg-[#424039] hover:text-white"
              onClick={newGame}
            >
              New game
            </button>
            {activeUserId && (
              <button
                type="button"
                className="inline-flex min-h-8 items-center justify-center rounded border border-white/8 bg-[#628d3f] px-3 text-xs font-extrabold text-white transition-colors hover:bg-[#7aa64c] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={saveCurrentGame}
                disabled={!!savedGameId}
              >
                {savedGameId ? "Saved" : "Save game"}
              </button>
            )}
          </div>
        )}

        <div className="flex w-[min(100%,50rem)] items-center justify-between gap-3 text-sm font-extrabold text-[#f5f3ed]">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-9 shrink-0 place-items-center rounded border border-white/8 bg-[#3c3935] text-white">
              <FaRobot aria-hidden="true" />
            </span>
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              Stockfish Engine
            </span>
          </div>

          <span>{botLabel}</span>
        </div>

        <div className="flex w-full min-w-0 justify-center">
          <div className="flex min-w-0 items-stretch justify-center gap-2 max-[44rem]:gap-1">
            {showEvaluationBar && (
              <EvaluationBar evaluation={evaluation} mate={mate} />
            )}

            <Board
              game={game}
              onMove={handlePlayerMove}
              selectedSquare={selectedSquare}
              onSelectSquare={setSelectedSquare}
              lastMove={lastMove}
              orientation={effectiveOrientation}
              interactive={!isThinking && !isGameOver}
              squareEvaluations={squareEvaluations}
              showEvaluationIcons={showMoveEvaluation}
              pieceSet={pieceSet}
            />
          </div>
        </div>

        <div className="flex w-[min(100%,50rem)] items-center justify-between gap-3 text-sm font-extrabold text-[#f5f3ed]">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-9 shrink-0 place-items-center rounded border border-white/8 bg-[#3c3935] text-white">
              <FaUser aria-hidden="true" />
            </span>
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              Gabriel-Logan
            </span>
          </div>

          <span>{playerLabel}</span>
        </div>

        <div className="flex min-h-8 items-center gap-2 rounded-md border border-white/7 bg-black/20 px-3 text-xs font-bold text-[#cbc8c0] xl:hidden">
          Opening
          <strong>{openingName ?? "not detected yet"}</strong>
        </div>
      </div>

      <aside className="flex min-h-[calc(100vh-2.5rem)] flex-col overflow-hidden rounded-lg border border-[#accc821a] bg-[#22251f] shadow-[0_1rem_2.5rem_rgb(0_0_0_/_20%)] max-[72rem]:min-h-0">
        <div className="flex min-h-13 items-center justify-between border-b border-[#accc821a] bg-linear-to-br from-[#1f241f] to-[#20211e] px-4 text-base font-extrabold text-white">
          <span>Game Console</span>
          <button
            type="button"
            className="grid size-9 place-items-center rounded bg-transparent text-[#aaa7a0] transition-colors hover:bg-white/7 hover:text-white"
            title={soundEnabled ? "Mute sounds" : "Enable sounds"}
            onClick={() => {
              setSoundEnabled(!soundEnabled);
            }}
          >
            {soundEnabled ? (
              <FaVolumeUp aria-hidden="true" />
            ) : (
              <FaVolumeOff aria-hidden="true" />
            )}
          </button>
        </div>

        {!gameStarted && moves.length === 0 ? (
          <div className="grid grid-cols-[auto_1fr] items-center gap-3 border-b border-[#accc821a] bg-[#252820] bg-linear-to-br from-[#628d3f2b] to-transparent p-4 max-[44rem]:grid-cols-1">
            <div className="grid size-12 place-items-center rounded-md border border-white/10 bg-[#3e684e] text-xl text-[#eaf7db]">
              <FaRobot aria-hidden="true" />
            </div>

            <div className="flex min-w-0 flex-col gap-1 text-sm leading-relaxed text-[#c9d0bd]">
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/8 bg-linear-to-br from-[#7fa64c] to-[#4f8468] px-4 text-sm font-extrabold text-white shadow-[inset_0_-0.14rem_0_rgb(0_0_0_/_20%)] transition hover:from-[#8bb75a] hover:to-[#5b9476]"
                onClick={handleStartGame}
                disabled={!connected}
              >
                Start Game
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[auto_1fr] items-center gap-3 border-b border-[#accc821a] bg-[#252820] bg-linear-to-br from-[#628d3f2b] to-transparent p-4 max-[44rem]:grid-cols-1">
            <div className="grid size-12 place-items-center rounded-md border border-white/10 bg-[#3e684e] text-xl text-[#eaf7db]">
              <FaRobot aria-hidden="true" />
            </div>

            <div className="flex min-w-0 flex-col gap-1 text-sm leading-relaxed text-[#c9d0bd]">
              <strong className="text-base text-[#f4f3ea]">
                Ready for your move
              </strong>
              <span>Stockfish will respond after you play.</span>
            </div>
          </div>
        )}

        <div className="border-b border-white/6 p-4">
          <div className="mb-3 hidden min-h-8 items-center gap-2 rounded-md border border-white/7 bg-black/20 px-3 text-xs font-bold text-[#cbc8c0] xl:flex">
            Opening
            <strong>{openingName ?? "not detected yet"}</strong>
          </div>

          {!gameStarted && moves.length === 0 && (
            <>
              <h2 className="mb-3 text-xs font-extrabold text-[#aaa7a0] uppercase">
                Game setup
              </h2>

              <div className="grid grid-cols-2 gap-3 max-[44rem]:grid-cols-1">
                <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-[#aaa7a0]">
                  <span>Play as</span>
                  <select
                    className="h-10 w-full rounded border border-white/10 bg-[#373530] px-3 text-sm text-[#ebe8df] outline-none focus:border-[#9ac45c] focus:ring-3 focus:ring-[#9ac45c2e]"
                    value={playerColor}
                    onChange={(e) => {
                      setPlayerColor(e.target.value as "w" | "b");
                    }}
                  >
                    <option value="w">White</option>
                    <option value="b">Black</option>
                  </select>
                </label>

                <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-[#aaa7a0]">
                  <span>Bot Elo: {botElo}</span>
                  <input
                    className="h-2 w-full cursor-pointer accent-[#86a94f]"
                    type="range"
                    min={UCI_ELO_MIN}
                    max={UCI_ELO_MAX}
                    value={botElo}
                    onChange={(e) => {
                      setBotElo(Number(e.target.value));
                    }}
                  />
                  <div className="flex justify-between text-[10px] text-[#7a786f]">
                    <span>{UCI_ELO_MIN}</span>
                    <span>{UCI_ELO_MAX}</span>
                  </div>
                </label>

                <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-[#aaa7a0]">
                  <span>Piece set</span>
                  <select
                    className="h-10 w-full rounded border border-white/10 bg-[#373530] px-3 text-sm text-[#ebe8df] outline-none focus:border-[#9ac45c] focus:ring-3 focus:ring-[#9ac45c2e]"
                    value={pieceSet}
                    onChange={(e) => {
                      setPieceSet(e.target.value as PieceSet);
                    }}
                  >
                    {PIECE_SETS.map((set) => {
                      return (
                        <option key={set.value} value={set.value}>
                          {set.label}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>

              <div className="mt-3 flex flex-col gap-2">
                <label className="flex min-h-8 items-center justify-between gap-3 text-sm text-[#d3d0c8]">
                  <span>Evaluation bar</span>
                  <input
                    className="size-4 accent-[#86a94f]"
                    type="checkbox"
                    checked={showEvaluationBar}
                    onChange={(e) => {
                      setShowEvaluationBar(e.target.checked);
                    }}
                  />
                </label>

                <label className="flex min-h-8 items-center justify-between gap-3 text-sm text-[#d3d0c8]">
                  <span>Move evaluation</span>
                  <input
                    className="size-4 accent-[#86a94f]"
                    type="checkbox"
                    checked={showMoveEvaluation}
                    onChange={(e) => {
                      setShowMoveEvaluation(e.target.checked);
                    }}
                  />
                </label>
              </div>
            </>
          )}

          {moves.length > 0 && (
            <button
              type="button"
              className="mt-2 inline-flex min-h-11 items-center justify-center rounded-md border border-white/8 bg-linear-to-br from-[#7fa64c] to-[#4f8468] px-4 text-sm font-extrabold text-white shadow-[inset_0_-0.14rem_0_rgb(0_0_0_/_20%)] transition hover:from-[#8bb75a] hover:to-[#5b9476]"
              onClick={newGame}
            >
              New game
            </button>
          )}
        </div>

        <div className="border-b border-white/6 p-4">
          <h2 className="mb-3 text-xs font-extrabold text-[#aaa7a0] uppercase">
            Opening
          </h2>

          <div className="rounded-md border border-white/6 bg-[#302e2a] p-3 text-sm font-bold text-[#f5f3ed]">
            {openingName ?? "No book match for this position yet"}
          </div>
        </div>

        <div className="min-h-48 flex-1 overflow-hidden border-b border-white/6 p-4">
          <h2 className="mb-3 text-xs font-extrabold text-[#aaa7a0] uppercase">
            Moves
          </h2>

          <MoveList
            moves={moves}
            currentMoveIndex={moves.length - 1}
            onGoToMove={() => {}}
            showEvaluation={showMoveEvaluation}
          />
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-[#accc821a] bg-[#1d211d] p-3 max-[44rem]:grid-cols-1">
          <button
            type="button"
            className={iconActionButtonClass}
            onClick={undoLastMove}
            disabled={moves.length === 0 || isGameOver}
            title="Undo last move"
          >
            <FaUndo aria-hidden="true" />
          </button>

          <button
            type="button"
            className={iconActionButtonClass}
            onClick={toggleBoard}
            title="Flip board"
          >
            <FaRedo aria-hidden="true" />
          </button>

          <button
            type="button"
            className={iconActionButtonClass}
            onClick={copyPgn}
            disabled={moves.length === 0}
            title="Copy PGN"
          >
            <FaClipboard aria-hidden="true" />
          </button>
        </div>
      </aside>
    </div>
  );
}
