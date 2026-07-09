import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FaClipboard,
  FaRedo,
  FaSave,
  FaUndo,
  FaUser,
  FaUsers,
  FaVolumeOff,
  FaVolumeUp,
} from "react-icons/fa";
import { toast } from "react-toastify";
import { Chess, type Square } from "chess.js";

import Board from "../components/Board";
import EvaluationBar from "../components/EvaluationBar";
import type { MoveEntry } from "../components/MoveList";
import MoveList from "../components/MoveList";
import {
  PIECE_SETS,
  type PieceSet,
  useSettingsStore,
} from "../store/settingsStore";
import { type SavedGame, useUserStore } from "../store/userStore";
import type { ClassificationValue } from "../types/chess-types";
import { AnalysisEngine } from "../utils/analysisEngine";
import { classifyMove } from "../utils/classification";
import { createId } from "../utils/createId";
import { getOpeningKey, getOpeningName } from "../utils/openingNames";
import {
  playCaptureSound,
  playGameOverSound,
  playMoveSound,
} from "../utils/sounds";

const CAPTURED_PIECE_ORDER = ["q", "r", "b", "n", "p"] as const;
const PIECE_VALUES = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
} as const;
const CAPTURED_PIECE_ALT_KEYS = {
  w: {
    p: "board.whitePawn",
    n: "board.whiteKnight",
    b: "board.whiteBishop",
    r: "board.whiteRook",
    q: "board.whiteQueen",
  },
  b: {
    p: "board.blackPawn",
    n: "board.blackKnight",
    b: "board.blackBishop",
    r: "board.blackRook",
    q: "board.blackQueen",
  },
} as const;

type CapturedPiece = (typeof CAPTURED_PIECE_ORDER)[number];
type PromotionPiece = "q" | "r" | "b" | "n";

function getMoveUci(move: { from: string; to: string; promotion?: string }) {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function getCapturedPieces(moves: MoveEntry[]) {
  const capturedByWhite: CapturedPiece[] = [];
  const capturedByBlack: CapturedPiece[] = [];

  for (const move of moves) {
    if (!move.captured) {
      continue;
    }

    if (move.color === "w") {
      capturedByWhite.push(move.captured);
    } else {
      capturedByBlack.push(move.captured);
    }
  }

  return {
    w: capturedByWhite,
    b: capturedByBlack,
  };
}

function getCapturedValue(pieces: CapturedPiece[]) {
  return pieces.reduce((total, piece) => {
    return total + PIECE_VALUES[piece];
  }, 0);
}

export default function FreePlay() {
  const { t } = useTranslation();
  const [game, setGame] = useState(() => {
    return new Chess();
  });
  const gameRef = useRef(game);
  const evalEngineRef = useRef<AnalysisEngine | null>(null);
  const movesRef = useRef<MoveEntry[]>([]);
  const analysisVersionRef = useRef(0);
  const evalQueueRef = useRef<Promise<void>>(Promise.resolve());

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(
    null,
  );
  const [moves, setMoves] = useState<MoveEntry[]>([]);
  const [evaluation, setEvaluation] = useState<number | null>(null);
  const [mate, setMate] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boardFlipped, setBoardFlipped] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [savedGameId, setSavedGameId] = useState<string | null>(null);

  const users = useUserStore((s) => s.users);
  const activeUserId = useUserStore((s) => s.activeUserId);
  const saveGameToStore = useUserStore((s) => s.saveGame);
  const activeUser = users.find((user) => {
    return user.id === activeUserId;
  });
  const playerName = activeUser?.name ?? t("common.noUser");

  const {
    showEvaluationBar,
    showMoveEvaluation,
    soundEnabled,
    pieceSet,
    setPieceSet,
    setShowEvaluationBar,
    setShowMoveEvaluation,
    setSoundEnabled,
  } = useSettingsStore();

  const syncMoves = useCallback((newMoves: MoveEntry[]) => {
    movesRef.current = newMoves;
    setMoves(newMoves);
  }, []);

  const classifyLastMove = useCallback(
    async (moveIndex: number, fenBefore: string, version: number) => {
      const evalEngine = evalEngineRef.current;
      const moveEntry = movesRef.current[moveIndex];

      if (!evalEngine?.connected || !moveEntry) {
        return;
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
          return;
        }

        const after = await evalEngine.analyzePosition(moveEntry.fen, 14);

        if (analysisVersionRef.current !== version) {
          return;
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
          return;
        }

        nextMoves[moveIndex] = {
          ...currentEntry,
          classification,
          evaluation: after.score ?? undefined,
          mate: after.mate ?? undefined,
        };

        syncMoves(nextMoves);
        setEvaluation(after.score);
        setMate(after.mate);
      } finally {
        releaseEvalTask();
      }
    },
    [syncMoves],
  );

  useEffect(() => {
    const evalEngine = new AnalysisEngine();
    evalEngineRef.current = evalEngine;

    evalEngine.onReady = () => {
      evalEngine.setFullStrength();
      evalEngine.startAnalysis(gameRef.current.fen(), 14, 1);
    };

    evalEngine.onAnalysis = (data) => {
      setEvaluation(data.score);
      setMate(data.mate);
    };

    evalEngine.onError = (msg) => {
      setError(msg);
      toast.error(msg);
    };

    evalEngine.onDisconnect = () => {
      setConnected(false);
      setError(t("errors.evaluationConnectionLost"));
      toast.error(t("errors.evalEngineDisconnected"));
    };

    evalEngine
      .connect()
      .then(() => {
        setConnected(true);
        toast.success(t("success.enginesConnected"));
      })
      .catch((err: Error) => {
        setError(err.message);
        toast.error(t("errors.connectionFailed", { message: err.message }));
      });

    return () => {
      evalEngine.disconnect();
      evalEngineRef.current = null;
    };
  }, [t]);

  useEffect(() => {
    const evalEngine = evalEngineRef.current;

    if (!evalEngine?.connected) {
      return;
    }

    evalEngine.setFullStrength();
  }, [connected]);

  const handleMove = useCallback(
    (from: Square, to: Square, promotion: PromotionPiece = "q") => {
      if (gameRef.current.isGameOver()) {
        return;
      }

      try {
        const fenBefore = gameRef.current.fen();
        const version = analysisVersionRef.current;
        const move = gameRef.current.move({ from, to, promotion });

        if (!move) {
          return;
        }

        setSavedGameId(null);
        setLastMove({ from: move.from as Square, to: move.to as Square });

        const entry: MoveEntry = {
          san: move.san,
          fen: gameRef.current.fen(),
          color: move.color as "w" | "b",
          from: move.from,
          to: move.to,
          uci: getMoveUci(move),
          captured: move.captured as CapturedPiece | undefined,
        };
        const nextMoves = [...movesRef.current, entry];
        const moveIndex = nextMoves.length - 1;

        syncMoves(nextMoves);
        void classifyLastMove(moveIndex, fenBefore, version);

        const gameOver = gameRef.current.isGameOver();
        setIsGameOver(gameOver);

        if (soundEnabled) {
          if (gameOver) {
            playGameOverSound();
          } else if (move.captured) {
            playCaptureSound();
          } else {
            playMoveSound();
          }
        }
      } catch {
        // Invalid move
      }
    },
    [classifyLastMove, soundEnabled, syncMoves],
  );

  const currentFen = game.fen();

  const openingName = useMemo(() => {
    const fens = moves.map((move) => {
      return move.fen;
    });
    fens.push(currentFen);

    for (let i = fens.length - 1; i >= 0; i--) {
      const name = getOpeningName(fens[i]);

      if (name) {
        return name;
      }
    }

    return null;
  }, [currentFen, moves]);

  const squareEvaluations = useMemo(() => {
    const evals: Record<string, ClassificationValue> = {};
    const move = moves[moves.length - 1];

    if (move?.to && move.classification) {
      evals[move.to] = move.classification;
    }

    return evals;
  }, [moves]);

  const capturedPieces = useMemo(() => {
    const pieces = getCapturedPieces(moves);
    const whiteValue = getCapturedValue(pieces.w);
    const blackValue = getCapturedValue(pieces.b);

    return {
      pieces,
      whiteValue,
      blackValue,
      materialScore: whiteValue - blackValue,
    };
  }, [moves]);

  function renderCapturedPieces(capturer: "w" | "b", pieces: CapturedPiece[]) {
    if (pieces.length === 0) {
      return <span className="text-[#77746c]">-</span>;
    }

    const capturedColor = capturer === "w" ? "b" : "w";
    const sortedPieces = [...pieces].sort((a, b) => {
      return CAPTURED_PIECE_ORDER.indexOf(a) - CAPTURED_PIECE_ORDER.indexOf(b);
    });

    return sortedPieces.map((piece, index) => {
      return (
        <img
          key={`${piece}-${index}`}
          src={`/pieces/${pieceSet}/${capturedColor}${piece.toUpperCase()}.svg`}
          alt={t(CAPTURED_PIECE_ALT_KEYS[capturedColor][piece])}
          className="size-6 object-contain"
          draggable={false}
        />
      );
    });
  }

  const undoLastMove = useCallback(() => {
    analysisVersionRef.current += 1;
    evalQueueRef.current = Promise.resolve();

    const evalEngine = evalEngineRef.current;

    if (evalEngine?.connected) {
      evalEngine.stopAnalysis();
    }

    const currentMoves = movesRef.current;

    if (currentMoves.length === 0) {
      return;
    }

    gameRef.current.undo();

    const newMoves = currentMoves.slice(0, currentMoves.length - 1);
    syncMoves(newMoves);

    if (newMoves.length > 0) {
      const prevMove = newMoves[newMoves.length - 1];
      setEvaluation(prevMove.evaluation ?? null);
      setMate(prevMove.mate ?? null);
    } else {
      setEvaluation(null);
      setMate(null);
    }

    const history = gameRef.current.history({ verbose: true });

    if (history.length > 0) {
      const last = history[history.length - 1];
      setLastMove({ from: last.from as Square, to: last.to as Square });
    } else {
      setLastMove(null);
    }

    setIsGameOver(false);
    setSelectedSquare(null);
    setSavedGameId(null);

    if (evalEngine?.connected) {
      evalEngine.setFullStrength();
      evalEngine.startAnalysis(gameRef.current.fen(), 14, 1);
    }
  }, [syncMoves]);

  const copyPgn = useCallback(() => {
    const pgn = gameRef.current.pgn();
    navigator.clipboard
      .writeText(pgn)
      .then(() => {
        toast.success(t("success.pgnCopied"));
      })
      .catch(() => {});
  }, [t]);

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
      id: createId(),
      pgn,
      date: new Date().toISOString(),
      result,
      opponent: t("freePlay.selfOpponent"),
      opening: openingName ?? undefined,
      playerColor: "w",
      moves: movesRef.current.length,
    };

    saveGameToStore(savedGame);
    setSavedGameId(savedGame.id);
    toast.success(t("success.gameSaved"));
  }, [activeUserId, savedGameId, openingName, saveGameToStore, t]);

  const newGame = useCallback(() => {
    analysisVersionRef.current += 1;
    evalQueueRef.current = Promise.resolve();

    const evalEngine = evalEngineRef.current;

    if (evalEngine?.connected) {
      evalEngine.stopAnalysis();
    }

    const newChess = new Chess();
    gameRef.current = newChess;
    setGame(newChess);
    syncMoves([]);
    setSelectedSquare(null);
    setLastMove(null);
    setEvaluation(null);
    setMate(null);
    setIsGameOver(false);
    setError(null);
    setSavedGameId(null);

    if (evalEngine?.connected) {
      evalEngine.setFullStrength();
      evalEngine.startAnalysis(newChess.fen(), 14, 1);
    }
  }, [syncMoves]);

  const iconActionButtonClass =
    "inline-flex min-h-11 items-center justify-center rounded-md border border-white/8 bg-linear-to-b from-[#3c3a36] to-[#302e2a] p-0 text-lg font-extrabold text-[#f4f1e8] shadow-[inset_0_-0.14rem_0_rgb(0_0_0_/_20%)] transition hover:from-[#484640] hover:to-[#383631] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="grid w-[min(100%,108rem)] grid-cols-[minmax(0,1fr)_minmax(20rem,31.25rem)] gap-4 max-[72rem]:grid-cols-1">
      <div className="flex min-w-0 flex-col items-center gap-3">
        {error && (
          <div className="w-[min(100%,50rem)] rounded-md border border-red-300/25 bg-[#5a201c] px-4 py-3 text-center text-sm font-bold text-[#ffd8d4]">
            {error}
          </div>
        )}

        {isGameOver && (
          <div className="flex w-[min(100%,50rem)] flex-wrap items-center justify-between gap-3 rounded-md border border-[#9dc47026] bg-[#20241f] px-3 py-2 shadow-[inset_0_1px_0_rgb(255_255_255_/_5%)]">
            <div className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full bg-[#f2be1f]" />
              <span className="text-sm font-extrabold text-[#f4f1e8]">
                {t("playComputer.gameOver")}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-white/8 bg-[#3b3934] px-3 text-xs font-extrabold text-[#f0ece3] transition-colors hover:bg-[#48453e] hover:text-white"
                onClick={newGame}
              >
                <FaRedo aria-hidden="true" />
                {t("common.newGame")}
              </button>

              {activeUserId && (
                <button
                  type="button"
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-white/8 bg-linear-to-br from-[#7fa64c] to-[#4f8468] px-3 text-xs font-extrabold text-white transition hover:from-[#8bb75a] hover:to-[#5b9476] disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={saveCurrentGame}
                  disabled={!!savedGameId}
                >
                  <FaSave aria-hidden="true" />
                  {savedGameId ? t("common.saved") : t("common.save")}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex w-[min(100%,50rem)] items-center justify-between gap-3 text-sm font-extrabold text-[#f5f3ed]">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-9 shrink-0 place-items-center rounded border border-white/8 bg-[#3c3935] text-white">
              <FaUser aria-hidden="true" />
            </span>
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {playerName}
            </span>
          </div>

          <span>{t("common.black")}</span>
        </div>

        <div className="flex w-full min-w-0 justify-center">
          <div className="flex min-w-0 items-stretch justify-center gap-2 max-[44rem]:gap-1">
            {showEvaluationBar && (
              <EvaluationBar evaluation={evaluation} mate={mate} />
            )}

            <Board
              game={game}
              onMove={handleMove}
              selectedSquare={selectedSquare}
              onSelectSquare={setSelectedSquare}
              lastMove={lastMove}
              orientation={boardFlipped ? "b" : "w"}
              interactive={!isGameOver}
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
              {playerName}
            </span>
          </div>

          <span>{t("common.white")}</span>
        </div>
      </div>

      <aside className="flex min-h-[calc(100vh-2.5rem)] flex-col overflow-hidden rounded-lg border border-[#accc821a] bg-[#22251f] shadow-[0_1rem_2.5rem_rgb(0_0_0_/_20%)] max-[72rem]:min-h-0">
        <div className="flex min-h-13 items-center justify-between border-b border-[#accc821a] bg-linear-to-br from-[#1f241f] to-[#20211e] px-4 text-base font-extrabold text-white">
          <span>{t("freePlay.title")}</span>
          <button
            type="button"
            className="grid size-9 place-items-center rounded bg-transparent text-[#aaa7a0] transition-colors hover:bg-white/7 hover:text-white"
            title={
              soundEnabled
                ? t("playComputer.muteSounds")
                : t("playComputer.enableSounds")
            }
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

        <div className="grid grid-cols-[auto_1fr] items-center gap-3 border-b border-[#accc821a] bg-[#252820] bg-linear-to-br from-[#628d3f2b] to-transparent p-4 max-[44rem]:grid-cols-1">
          <div className="grid size-12 place-items-center rounded-md border border-white/10 bg-[#3e684e] text-xl text-[#eaf7db]">
            <FaUsers aria-hidden="true" />
          </div>

          <div className="flex min-w-0 flex-col gap-1 text-sm leading-relaxed text-[#c9d0bd]">
            <strong className="text-base text-[#f4f3ea]">
              {game.turn() === "w"
                ? t("freePlay.whiteToMove")
                : t("freePlay.blackToMove")}
            </strong>
            <span>{t("freePlay.selfPlayStatus")}</span>
          </div>
        </div>

        <div className="border-b border-white/6 p-4">
          <div className="mb-3 hidden min-h-8 items-center gap-2 rounded-md border border-white/7 bg-black/20 px-3 text-xs font-bold text-[#cbc8c0] xl:flex">
            {t("common.opening")}
            <strong>
              {openingName
                ? t(`openings.${getOpeningKey(openingName)}`)
                : t("pgnViewer.openingNotDetected")}
            </strong>
          </div>

          <div className="grid grid-cols-2 gap-3 max-[44rem]:grid-cols-1">
            <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-[#aaa7a0]">
              <span>{t("common.pieceSet")}</span>
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
              <span>{t("common.evaluationBar")}</span>
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
              <span>{t("common.moveEvaluation")}</span>
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

          {moves.length > 0 && (
            <button
              type="button"
              className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md border border-white/8 bg-linear-to-br from-[#7fa64c] to-[#4f8468] px-4 text-sm font-extrabold text-white shadow-[inset_0_-0.14rem_0_rgb(0_0_0_/_20%)] transition hover:from-[#8bb75a] hover:to-[#5b9476]"
              onClick={newGame}
            >
              {t("common.newGame")}
            </button>
          )}
        </div>

        <div className="border-b border-white/6 p-4">
          <h2 className="mb-3 text-xs font-extrabold text-[#aaa7a0] uppercase">
            {t("common.opening")}
          </h2>

          <div className="rounded-md border border-white/6 bg-[#302e2a] p-3 text-sm font-bold text-[#f5f3ed]">
            {openingName
              ? t(`openings.${getOpeningKey(openingName)}`)
              : t("pgnViewer.noBookMatch")}
          </div>
        </div>

        <div className="border-b border-white/6 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-extrabold text-[#aaa7a0] uppercase">
              {t("playComputer.material")}
            </h2>

            <span className="rounded border border-white/7 bg-black/20 px-2 py-1 text-xs font-extrabold text-[#f4f1e8]">
              {capturedPieces.materialScore === 0
                ? t("playComputer.materialEven")
                : capturedPieces.materialScore > 0
                  ? t("playComputer.materialAdvantage", {
                      color: t("common.white"),
                      score: `+${capturedPieces.materialScore}`,
                    })
                  : t("playComputer.materialAdvantage", {
                      color: t("common.black"),
                      score: `+${Math.abs(capturedPieces.materialScore)}`,
                    })}
            </span>
          </div>

          <div className="grid gap-2 text-sm">
            <div className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 rounded border border-white/6 bg-[#302e2a] px-3 py-2">
              <span className="text-xs font-extrabold text-[#aaa7a0]">
                {t("common.white")}
              </span>

              <div className="flex min-h-6 flex-wrap items-center gap-1">
                {renderCapturedPieces("w", capturedPieces.pieces.w)}
              </div>

              <span className="text-xs font-extrabold text-[#dcd8cf]">
                {capturedPieces.whiteValue}
              </span>
            </div>

            <div className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 rounded border border-white/6 bg-[#302e2a] px-3 py-2">
              <span className="text-xs font-extrabold text-[#aaa7a0]">
                {t("common.black")}
              </span>

              <div className="flex min-h-6 flex-wrap items-center gap-1">
                {renderCapturedPieces("b", capturedPieces.pieces.b)}
              </div>

              <span className="text-xs font-extrabold text-[#dcd8cf]">
                {capturedPieces.blackValue}
              </span>
            </div>
          </div>
        </div>

        <div className="min-h-48 flex-1 overflow-hidden border-b border-white/6 p-4">
          <h2 className="mb-3 text-xs font-extrabold text-[#aaa7a0] uppercase">
            {t("common.moves")}
          </h2>

          <MoveList
            moves={moves}
            currentMoveIndex={moves.length - 1}
            onGoToMove={() => {}}
            showEvaluation={showMoveEvaluation}
          />
        </div>

        <div className="grid grid-cols-5 gap-2 border-t border-[#accc821a] bg-[#1d211d] p-3 max-[44rem]:grid-cols-1">
          <button
            type="button"
            className={iconActionButtonClass}
            onClick={undoLastMove}
            disabled={moves.length === 0}
            title={t("playComputer.undoLastMove")}
          >
            <FaUndo aria-hidden="true" />
          </button>

          <button
            type="button"
            className={iconActionButtonClass}
            onClick={() => {
              setBoardFlipped((prev) => {
                return !prev;
              });
            }}
            title={t("playComputer.flipBoard")}
          >
            <FaRedo aria-hidden="true" />
          </button>

          <button
            type="button"
            className={iconActionButtonClass}
            onClick={copyPgn}
            disabled={moves.length === 0}
            title={t("playComputer.copyPgn")}
          >
            <FaClipboard aria-hidden="true" />
          </button>

          <button
            type="button"
            className={iconActionButtonClass}
            onClick={saveCurrentGame}
            disabled={moves.length === 0 || !activeUserId || !!savedGameId}
            title={savedGameId ? t("common.saved") : t("common.save")}
          >
            <FaSave aria-hidden="true" />
          </button>

          <button
            type="button"
            className={iconActionButtonClass}
            onClick={newGame}
            title={t("common.newGame")}
          >
            <FaRedo aria-hidden="true" />
          </button>
        </div>
      </aside>
    </div>
  );
}
