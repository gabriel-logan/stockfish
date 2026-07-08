import { useCallback, useMemo } from "react";
import { Chess, type Square } from "chess.js";

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
  interactive = true,
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

    let className =
      "relative flex items-center justify-center [width:clamp(2.3rem,min(5.4vw,8.8vh),7.4rem)] [height:clamp(2.3rem,min(5.4vw,8.8vh),7.4rem)]";

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
            {displayFiles.map((_file, col) => {
              const boardRow = orientation === "w" ? row : 7 - row;
              const boardCol = orientation === "w" ? col : 7 - col;
              const square = `${FILES[boardCol]}${RANKS[boardRow]}` as Square;
              const piece = board[boardRow][boardCol];
              const isLegalTarget = legalTargets.has(square);

              return (
                <div
                  key={square}
                  className={getSquareClass(row, col, square)}
                  onClick={() => {
                    handleClick(square);
                  }}
                >
                  {piece && (
                    <img
                      src={`/pieces/cburnett/${piece.color}${piece.type.toUpperCase()}.svg`}
                      alt={`${piece.color}${piece.type}`}
                      className="size-[86%] drop-shadow-[0_0.11rem_0.08rem_rgb(0_0_0_/_22%)]"
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
                      className="pointer-events-none absolute top-0.5 right-0.5 z-10 size-5 drop-shadow-[0_0.06rem_0.1rem_rgb(0_0_0_/_40%)]"
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
