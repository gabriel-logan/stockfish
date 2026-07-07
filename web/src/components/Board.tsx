import { useCallback, useMemo } from "react";
import { Chess, type Square } from "chess.js";

interface BoardProps {
  game: Chess;
  onMove?: (from: Square, to: Square) => void;
  selectedSquare?: Square | null;
  onSelectSquare?: (square: Square | null) => void;
  lastMove?: { from: Square; to: Square } | null;
  orientation?: "w" | "b";
  squareEvaluations?: Record<string, string>;
  showEvaluationIcons?: boolean;
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

export default function Board({
  game,
  onMove = () => {},
  selectedSquare = null,
  onSelectSquare = () => {},
  lastMove = null,
  orientation = "w",
  squareEvaluations = {},
  showEvaluationIcons = false,
}: BoardProps) {
  const board = game.board();

  const displayRanks = orientation === "w" ? RANKS : [...RANKS].reverse();
  const displayFiles = orientation === "w" ? FILES : [...FILES].reverse();

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
    [selectedSquare, game, onMove, onSelectSquare, legalTargets],
  );

  function getSquareClass(row: number, col: number, square: Square): string {
    const isLight = (row + col) % 2 === 0;
    const isSelected = square === selectedSquare;
    const isLastMoveSquare =
      lastMove !== null && (lastMove.from === square || lastMove.to === square);

    let cls = isLight ? "bg-[#f0d9b5]" : "bg-[#b58863]";

    if (isSelected) {
      cls = "bg-[#f6f669]";
    } else if (isLastMoveSquare) {
      cls = isLight ? "bg-[#ddd26b]" : "bg-[#aaa23a]";
    }

    return cls;
  }

  return (
    <div className="inline-block border-2 border-gray-800 select-none">
      {displayRanks.map((rank, row) => {
        return (
          <div key={rank} className="flex">
            {displayFiles.map((_file, col) => {
              const boardRow = orientation === "w" ? row : 7 - row;
              const boardCol = orientation === "w" ? col : 7 - col;
              const square = `${FILES[boardCol]}${RANKS[boardRow]}` as Square;
              const piece = board[boardRow][boardCol];
              const isLegalTarget = legalTargets.has(square);

              return (
                <div
                  key={square}
                  className={`relative flex h-[60px] w-[60px] cursor-pointer items-center justify-center ${getSquareClass(row, col, square)}`}
                  onClick={() => {
                    handleClick(square);
                  }}
                >
                  {piece && (
                    <img
                      src={`/pieces/cburnett/${piece.color}${piece.type.toUpperCase()}.svg`}
                      alt={`${piece.color}${piece.type}`}
                      className="h-[50px] w-[50px]"
                      draggable={false}
                    />
                  )}
                  {isLegalTarget && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      {piece ? (
                        <div className="h-8 w-8 rounded-full border-4 border-gray-800/30" />
                      ) : (
                        <div className="h-3 w-3 rounded-full bg-gray-800/30" />
                      )}
                    </div>
                  )}
                  {showEvaluationIcons && squareEvaluations[square] && (
                    <div className="pointer-events-none absolute top-0 right-0">
                      <img
                        src={`/icons/${squareEvaluations[square]}.png`}
                        alt={squareEvaluations[square]}
                        title={squareEvaluations[square]}
                        className="h-4 w-4"
                      />
                    </div>
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
