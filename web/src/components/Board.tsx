import { useCallback, useMemo } from "react";
import { Chess, type Square } from "chess.js";

import type { PieceSet } from "../store/settingsStore";

interface BoardProps {
  game: Chess;
  onMove?: (from: Square, to: Square) => void;
  selectedSquare?: Square | null;
  onSelectSquare?: (square: Square | null) => void;
  lastMove?: { from: Square; to: Square } | null;
  orientation?: "w" | "b";
  interactive?: boolean;
  squareEvaluations?: Record<string, string>;
  showEvaluationIcons?: boolean;
  pieceSet?: PieceSet;
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

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

export default function Board({
  game,
  onMove = () => {},
  selectedSquare = null,
  onSelectSquare = () => {},
  lastMove = null,
  orientation = "w",
  interactive = true,
  squareEvaluations = {},
  showEvaluationIcons = false,
  pieceSet = "maestro",
}: BoardProps) {
  const board = game.board();

  const displayRanks = getDisplayRanks(orientation);

  const displayFiles = getDisplayFiles(orientation);

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
        onMove(selectedSquare, square);
        onSelectSquare(null);
      }
    },
    [selectedSquare, game, onMove, onSelectSquare, legalTargets, interactive],
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
    <div className="inline-block overflow-hidden rounded-[0.2rem] border-[0.2rem] border-[#2a2925] shadow-[0_0.75rem_1.8rem_rgb(0_0_0_/_24%)] select-none">
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
                      alt={`${piece.color}${piece.type}`}
                      className="size-[86%] object-contain drop-shadow-[0_0.1rem_0.06rem_rgb(0_0_0_/_18%)]"
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
                      alt={squareEvaluations[square]}
                      title={squareEvaluations[square]}
                      className="pointer-events-none absolute top-0.5 right-0.5 z-10 size-7 drop-shadow-[0_0.06rem_0.1rem_rgb(0_0_0_/_40%)]"
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
