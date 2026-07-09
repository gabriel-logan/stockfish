import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Chess, type Square } from "chess.js";

import type { PieceSet } from "../store/settingsStore";
import type { ClassificationValue } from "../types/chess-types";

interface BoardProps {
  game: Chess;
  onMove?: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  selectedSquare?: Square | null;
  onSelectSquare?: (square: Square | null) => void;
  lastMove?: { from: Square; to: Square } | null;
  suggestedMove?: { from: Square; to: Square } | null;
  orientation?: "w" | "b";
  interactive?: boolean;
  squareEvaluations?: Record<string, ClassificationValue>;
  showEvaluationIcons?: boolean;
  pieceSet?: PieceSet;
}

type PromotionPiece = "q" | "r" | "b" | "n";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];
const PROMOTION_PIECES: PromotionPiece[] = ["q", "r", "b", "n"];

const SQUARE_SIZE_CLASS =
  "[width:clamp(2.5rem,min(6.2vw,10.2vh),8.25rem)] [height:clamp(2.5rem,min(6.2vw,10.2vh),8.25rem)]";

function getCoordinateColorClass(row: number, col: number): string {
  const isLight = (row + col) % 2 === 0;

  if (isLight) {
    return "text-[#b58863]";
  }

  return "text-[#f0d9b5]";
}

function getDisplayRanks(orientation: "w" | "b"): string[] {
  if (orientation === "w") {
    return RANKS;
  }

  return [...RANKS].reverse();
}

function getDisplayFiles(orientation: "w" | "b"): string[] {
  if (orientation === "w") {
    return FILES;
  }

  return [...FILES].reverse();
}

function getBoardRow(row: number, orientation: "w" | "b"): number {
  if (orientation === "w") {
    return row;
  }

  return 7 - row;
}

function getBoardCol(col: number, orientation: "w" | "b"): number {
  if (orientation === "w") {
    return col;
  }

  return 7 - col;
}

function isPromotionMove(game: Chess, from: Square, to: Square): boolean {
  const piece = game.get(from);

  if (!piece || piece.type !== "p") {
    return false;
  }

  const promotionRank = piece.color === "w" ? "8" : "1";

  if (!to.endsWith(promotionRank)) {
    return false;
  }

  const moves = game.moves({ square: from, verbose: true });

  return moves.some((move) => {
    return move.to === to && !!move.promotion;
  });
}

function getSquareCenter(square: Square, orientation: "w" | "b") {
  const fileIndex = FILES.indexOf(square[0]);
  const rankIndex = RANKS.indexOf(square[1]);

  if (fileIndex === -1 || rankIndex === -1) {
    return null;
  }

  const col = orientation === "w" ? fileIndex : 7 - fileIndex;
  const row = orientation === "w" ? rankIndex : 7 - rankIndex;

  return {
    x: (col + 0.5) * 12.5,
    y: (row + 0.5) * 12.5,
  };
}

export default function Board({
  game,
  onMove = () => {},
  selectedSquare = null,
  onSelectSquare = () => {},
  lastMove = null,
  suggestedMove = null,
  orientation = "w",
  interactive = true,
  squareEvaluations = {},
  showEvaluationIcons = false,
  pieceSet = "maestro",
}: BoardProps) {
  const { t } = useTranslation();
  const [promotionMove, setPromotionMove] = useState<{
    from: Square;
    to: Square;
    color: "w" | "b";
  } | null>(null);

  const pieceTypeName = {
    p: "Pawn",
    n: "Knight",
    b: "Bishop",
    r: "Rook",
    q: "Queen",
    k: "King",
  } as const;

  const board = game.board();

  const displayRanks = getDisplayRanks(orientation);

  const displayFiles = getDisplayFiles(orientation);

  const suggestedMovePoints = useMemo(() => {
    if (!suggestedMove) {
      return null;
    }

    const from = getSquareCenter(suggestedMove.from, orientation);
    const to = getSquareCenter(suggestedMove.to, orientation);

    if (!from || !to) {
      return null;
    }

    return { from, to };
  }, [orientation, suggestedMove]);

  const legalTargets = useMemo(() => {
    if (!selectedSquare) {
      return new Set<string>();
    }

    try {
      const moves = game.moves({ square: selectedSquare, verbose: true });

      return new Set(
        moves.map((m) => {
          return m.to;
        }),
      );
    } catch {
      return new Set<string>();
    }
  }, [game, selectedSquare]);

  const handleClick = useCallback(
    (square: Square) => {
      if (!interactive) {
        return;
      }

      if (promotionMove) {
        return;
      }

      const piece = game.get(square);

      if (!selectedSquare) {
        if (piece && piece.color === game.turn()) {
          onSelectSquare(square);
        }
        return;
      }

      if (square === selectedSquare) {
        onSelectSquare(null);
        return;
      }

      if (piece && piece.color === game.turn()) {
        onSelectSquare(square);
        return;
      }

      if (legalTargets.has(square)) {
        if (isPromotionMove(game, selectedSquare, square)) {
          const selectedPiece = game.get(selectedSquare);

          if (selectedPiece) {
            setPromotionMove({
              from: selectedSquare,
              to: square,
              color: selectedPiece.color,
            });
          }

          return;
        }

        onMove(selectedSquare, square);
        onSelectSquare(null);
      }
    },
    [
      selectedSquare,
      game,
      onMove,
      onSelectSquare,
      legalTargets,
      interactive,
      promotionMove,
    ],
  );

  function getSquareClass(row: number, col: number, square: Square): string {
    const isLight = (row + col) % 2 === 0;
    const isSelected = square === selectedSquare;
    const isLastMoveSquare =
      lastMove !== null && (lastMove.from === square || lastMove.to === square);

    let className = `relative flex items-center justify-center ${SQUARE_SIZE_CLASS}`;

    if (interactive) {
      className = `${className} cursor-pointer`;
    }

    if (isSelected) {
      return `${className} bg-[#f6f669]`;
    }

    if (isLastMoveSquare) {
      if (isLight) {
        return `${className} bg-[#ddd26b]`;
      }

      return `${className} bg-[#aaa23a]`;
    }

    if (isLight) {
      return `${className} bg-[#f0d9b5]`;
    }

    return `${className} bg-[#b58863]`;
  }

  return (
    <div className="relative inline-block overflow-hidden rounded-[0.2rem] border-[0.2rem] border-[#2a2925] shadow-[0_0.75rem_1.8rem_rgb(0_0_0_/_24%)] select-none">
      {suggestedMovePoints && (
        <svg
          className="pointer-events-none absolute inset-0 z-10 size-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="suggested-move-arrowhead"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" fill="#a8d45f" />
            </marker>
          </defs>
          <line
            x1={suggestedMovePoints.from.x}
            y1={suggestedMovePoints.from.y}
            x2={suggestedMovePoints.to.x}
            y2={suggestedMovePoints.to.y}
            stroke="#a8d45f"
            strokeWidth="2.4"
            strokeLinecap="round"
            markerEnd="url(#suggested-move-arrowhead)"
            opacity="0.82"
          />
        </svg>
      )}

      {displayRanks.map((rank, row) => {
        return (
          <div key={rank} className="flex">
            {displayFiles.map((file, col) => {
              const boardRow = getBoardRow(row, orientation);

              const boardCol = getBoardCol(col, orientation);

              const square = `${FILES[boardCol]}${RANKS[boardRow]}` as Square;

              const piece = board[boardRow][boardCol];

              const isLegalTarget = legalTargets.has(square);

              const coordinateColorClass = getCoordinateColorClass(row, col);

              return (
                <div
                  key={square}
                  className={getSquareClass(row, col, square)}
                  onClick={() => {
                    handleClick(square);
                  }}
                >
                  {col === 0 && (
                    <span
                      className={`pointer-events-none absolute top-0.5 left-1 z-10 text-[0.65rem] leading-none font-black select-none ${coordinateColorClass}`}
                    >
                      {rank}
                    </span>
                  )}

                  {row === 7 && (
                    <span
                      className={`pointer-events-none absolute right-1 bottom-0.5 z-10 text-[0.65rem] leading-none font-black select-none ${coordinateColorClass}`}
                    >
                      {file}
                    </span>
                  )}

                  {piece && (
                    <img
                      src={`/pieces/${pieceSet}/${piece.color}${piece.type.toUpperCase()}.svg`}
                      alt={t(
                        `board.${piece.color === "w" ? "white" : "black"}${pieceTypeName[piece.type]}`,
                      )}
                      className="size-[95%] object-contain drop-shadow-[0_0.1rem_0.06rem_rgb(0_0_0_/_18%)]"
                      draggable={false}
                    />
                  )}
                  {isLegalTarget && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      {piece ? (
                        <div className="size-[52%] rounded-full border-4 border-black/25" />
                      ) : (
                        <div className="size-[22%] rounded-full bg-black/25" />
                      )}
                    </div>
                  )}
                  {showEvaluationIcons && squareEvaluations[square] && (
                    <img
                      src={`/icons/${squareEvaluations[square]}.png`}
                      alt={t(`classification.${squareEvaluations[square]}`)}
                      title={t(`classification.${squareEvaluations[square]}`)}
                      className="pointer-events-none absolute top-[4%] right-[4%] z-10 size-[32%] object-contain drop-shadow-[0_0.06rem_0.1rem_rgb(0_0_0_/_40%)]"
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {promotionMove && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45">
          <div className="grid grid-cols-4 gap-2 rounded-md border border-white/10 bg-[#252820] p-2 shadow-[0_1rem_2rem_rgb(0_0_0_/_35%)]">
            {PROMOTION_PIECES.map((piece) => {
              const label = t(
                `board.${promotionMove.color === "w" ? "white" : "black"}${pieceTypeName[piece]}`,
              );

              return (
                <button
                  key={piece}
                  type="button"
                  className="grid size-14 place-items-center rounded border border-white/8 bg-[#3b3934] transition-colors hover:bg-[#4b493f]"
                  title={label}
                  onClick={() => {
                    onMove(promotionMove.from, promotionMove.to, piece);
                    onSelectSquare(null);
                    setPromotionMove(null);
                  }}
                >
                  <img
                    src={`/pieces/${pieceSet}/${promotionMove.color}${piece.toUpperCase()}.svg`}
                    alt={label}
                    className="size-[90%] object-contain"
                    draggable={false}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
