import { type MouseEvent, useCallback, useMemo, useRef, useState } from "react";
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
type BoardArrow = { from: Square; to: Square };
type ManualArrowPoints = {
  key?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  head: string;
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];
const PROMOTION_PIECES: PromotionPiece[] = ["q", "r", "b", "n"];
const BOARD_VIEWBOX_SIZE = 800;
const BOARD_SQUARE_SIZE = BOARD_VIEWBOX_SIZE / 8;

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
    x: (col + 0.5) * BOARD_SQUARE_SIZE,
    y: (row + 0.5) * BOARD_SQUARE_SIZE,
  };
}

function getSquareFromPoint(
  x: number,
  y: number,
  boardElement: HTMLDivElement,
  orientation: "w" | "b",
): Square | null {
  const rect = boardElement.getBoundingClientRect();
  const localX = x - rect.left;
  const localY = y - rect.top;

  if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) {
    return null;
  }

  const displayCol = Math.min(7, Math.floor((localX / rect.width) * 8));
  const displayRow = Math.min(7, Math.floor((localY / rect.height) * 8));
  const boardCol = getBoardCol(displayCol, orientation);
  const boardRow = getBoardRow(displayRow, orientation);

  return `${FILES[boardCol]}${RANKS[boardRow]}` as Square;
}

function getArrowLine(
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return null;
  }

  const endOffset = Math.min(38, length * 0.22);

  return {
    x1: from.x,
    y1: from.y,
    x2: to.x - (dx / length) * endOffset,
    y2: to.y - (dy / length) * endOffset,
  };
}

function getManualArrowPoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
): ManualArrowPoints | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return null;
  }

  const unitX = dx / length;
  const unitY = dy / length;
  const perpX = -unitY;
  const perpY = unitX;
  const headLength = Math.min(54, length * 0.42);
  const headWidth = Math.min(62, length * 0.5);
  const baseX = to.x - unitX * headLength;
  const baseY = to.y - unitY * headLength;
  const halfWidth = headWidth / 2;

  const leftX = baseX + perpX * halfWidth;
  const leftY = baseY + perpY * halfWidth;
  const rightX = baseX - perpX * halfWidth;
  const rightY = baseY - perpY * halfWidth;

  return {
    x1: from.x,
    y1: from.y,
    x2: baseX,
    y2: baseY,
    head: `${to.x},${to.y} ${leftX},${leftY} ${rightX},${rightY}`,
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
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [promotionMove, setPromotionMove] = useState<{
    from: Square;
    to: Square;
    color: "w" | "b";
  } | null>(null);
  const [markedSquares, setMarkedSquares] = useState<Set<Square>>(() => {
    return new Set();
  });
  const [manualArrows, setManualArrows] = useState<BoardArrow[]>([]);
  const [rightDrag, setRightDrag] = useState<BoardArrow | null>(null);

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

    return getArrowLine(from, to);
  }, [orientation, suggestedMove]);

  const manualArrowPoints = useMemo(() => {
    return manualArrows
      .map((arrow) => {
        const from = getSquareCenter(arrow.from, orientation);
        const to = getSquareCenter(arrow.to, orientation);

        if (!from || !to) {
          return null;
        }

        const points = getManualArrowPoints(from, to);

        if (!points) {
          return null;
        }

        return {
          key: `${arrow.from}-${arrow.to}`,
          ...points,
        };
      })
      .filter((arrow): arrow is ManualArrowPoints & { key: string } => {
        return arrow !== null;
      });
  }, [manualArrows, orientation]);

  const rightDragArrowPoints = useMemo(() => {
    if (!rightDrag || rightDrag.from === rightDrag.to) {
      return null;
    }

    const from = getSquareCenter(rightDrag.from, orientation);
    const to = getSquareCenter(rightDrag.to, orientation);

    if (!from || !to) {
      return null;
    }

    return getManualArrowPoints(from, to);
  }, [orientation, rightDrag]);

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

  const preventRightClick = useCallback((event: MouseEvent) => {
    event.preventDefault();
  }, []);

  const toggleMarkedSquare = useCallback((square: Square) => {
    setMarkedSquares((currentSquares) => {
      const nextSquares = new Set(currentSquares);

      if (nextSquares.has(square)) {
        nextSquares.delete(square);
      } else {
        nextSquares.add(square);
      }

      return nextSquares;
    });
  }, []);

  const handleMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button !== 2 || !boardRef.current) {
        return;
      }

      event.preventDefault();
      const square = getSquareFromPoint(
        event.clientX,
        event.clientY,
        boardRef.current,
        orientation,
      );

      if (!square) {
        return;
      }

      setRightDrag({ from: square, to: square });
    },
    [orientation],
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!rightDrag || !boardRef.current) {
        return;
      }

      event.preventDefault();
      const square = getSquareFromPoint(
        event.clientX,
        event.clientY,
        boardRef.current,
        orientation,
      );

      if (!square || square === rightDrag.to) {
        return;
      }

      setRightDrag({
        from: rightDrag.from,
        to: square,
      });
    },
    [orientation, rightDrag],
  );

  const handleMouseUp = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button !== 2 || !rightDrag || !boardRef.current) {
        return;
      }

      event.preventDefault();
      const square =
        getSquareFromPoint(
          event.clientX,
          event.clientY,
          boardRef.current,
          orientation,
        ) ?? rightDrag.to;

      if (square === rightDrag.from) {
        toggleMarkedSquare(square);
        setRightDrag(null);
        return;
      }

      const nextArrow = { from: rightDrag.from, to: square };

      setManualArrows((currentArrows) => {
        const existingArrow = currentArrows.find((arrow) => {
          return arrow.from === nextArrow.from && arrow.to === nextArrow.to;
        });

        if (existingArrow) {
          return currentArrows.filter((arrow) => {
            return arrow.from !== nextArrow.from || arrow.to !== nextArrow.to;
          });
        }

        return [...currentArrows, nextArrow];
      });

      setRightDrag(null);
    },
    [orientation, rightDrag, toggleMarkedSquare],
  );

  const handleClick = useCallback(
    (square: Square) => {
      setMarkedSquares((currentSquares) => {
        if (currentSquares.size === 0) {
          return currentSquares;
        }

        return new Set();
      });
      setManualArrows((currentArrows) => {
        if (currentArrows.length === 0) {
          return currentArrows;
        }

        return [];
      });

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
    <div
      ref={boardRef}
      className="relative inline-block overflow-hidden rounded-[0.2rem] border-[0.2rem] border-[#2a2925] shadow-[0_0.75rem_1.8rem_rgb(0_0_0_/_24%)] select-none"
      onContextMenu={preventRightClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setRightDrag(null);
      }}
    >
      {(suggestedMovePoints ||
        manualArrowPoints.length > 0 ||
        rightDragArrowPoints) && (
        <svg
          className="pointer-events-none absolute inset-0 z-10 size-full"
          viewBox={`0 0 ${BOARD_VIEWBOX_SIZE} ${BOARD_VIEWBOX_SIZE}`}
          aria-hidden="true"
        >
          <defs>
            <filter
              id="suggested-move-shadow"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feDropShadow
                dx="0"
                dy="3"
                stdDeviation="3"
                floodColor="#11160d"
                floodOpacity="0.45"
              />
            </filter>
            <marker
              id="suggested-move-arrowhead"
              markerWidth="2.6"
              markerHeight="2.6"
              refX="2.25"
              refY="1.3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 2.6 1.3 L 0 2.6 z" fill="#bce66b" />
            </marker>
          </defs>
          {suggestedMovePoints && (
            <line
              x1={suggestedMovePoints.x1}
              y1={suggestedMovePoints.y1}
              x2={suggestedMovePoints.x2}
              y2={suggestedMovePoints.y2}
              stroke="#bce66b"
              strokeWidth="20"
              strokeLinecap="round"
              markerEnd="url(#suggested-move-arrowhead)"
              filter="url(#suggested-move-shadow)"
              opacity="0.72"
            />
          )}
          {manualArrowPoints.map((arrow) => {
            return (
              <g
                key={arrow.key}
                filter="url(#suggested-move-shadow)"
                opacity="0.72"
              >
                <line
                  x1={arrow.x1}
                  y1={arrow.y1}
                  x2={arrow.x2}
                  y2={arrow.y2}
                  stroke="#f59e0b"
                  strokeWidth="20"
                  strokeLinecap="round"
                />
                <polygon points={arrow.head} fill="#f59e0b" />
              </g>
            );
          })}
          {rightDragArrowPoints && (
            <g filter="url(#suggested-move-shadow)" opacity="0.55">
              <line
                x1={rightDragArrowPoints.x1}
                y1={rightDragArrowPoints.y1}
                x2={rightDragArrowPoints.x2}
                y2={rightDragArrowPoints.y2}
                stroke="#f59e0b"
                strokeWidth="20"
                strokeLinecap="round"
              />
              <polygon points={rightDragArrowPoints.head} fill="#f59e0b" />
            </g>
          )}
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

              const isMarked = markedSquares.has(square);

              const coordinateColorClass = getCoordinateColorClass(row, col);

              return (
                <div
                  key={square}
                  className={getSquareClass(row, col, square)}
                  onClick={() => {
                    handleClick(square);
                  }}
                >
                  {isMarked && (
                    <div className="pointer-events-none absolute inset-0 bg-[#ef4444]/42" />
                  )}

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
