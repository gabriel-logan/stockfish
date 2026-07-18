import { Chess, type Square } from "chess.js";

import type { PromotionPiece } from "../types/chess-types";

export type BoardOrientation = "w" | "b";
export type BoardArrow = { from: Square; to: Square };
export type ArrowPoints = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  head: string;
};
export type DisplayArrow = ArrowPoints & {
  key: string;
  color: string;
  opacity: number;
};

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
export const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];
export const PROMOTION_PIECES: PromotionPiece[] = ["q", "r", "b", "n"];
export const PIECE_TYPE_NAMES = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
} as const;
export const BOARD_VIEWBOX_SIZE = 800;
export const BOARD_SQUARE_SIZE = BOARD_VIEWBOX_SIZE / 8;
export const SQUARE_SIZE_CLASS =
  "[width:clamp(2.5rem,min(6.2vw,10.2vh),8.25rem)] [height:clamp(2.5rem,min(6.2vw,10.2vh),8.25rem)]";

export function getCoordinateColorClass(row: number, col: number): string {
  const isLight = (row + col) % 2 === 0;

  if (isLight) {
    return "text-[#b58863]";
  }

  return "text-[#f0d9b5]";
}

export function getDisplayRanks(orientation: BoardOrientation): string[] {
  if (orientation === "w") {
    return RANKS;
  }

  return [...RANKS].reverse();
}

export function getDisplayFiles(orientation: BoardOrientation): string[] {
  if (orientation === "w") {
    return FILES;
  }

  return [...FILES].reverse();
}

export function getBoardRow(
  row: number,
  orientation: BoardOrientation,
): number {
  if (orientation === "w") {
    return row;
  }

  return 7 - row;
}

export function getBoardCol(
  col: number,
  orientation: BoardOrientation,
): number {
  if (orientation === "w") {
    return col;
  }

  return 7 - col;
}

export function isPromotionMove(
  game: Chess,
  from: Square,
  to: Square,
): boolean {
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

export function getLegalTargets(game: Chess, square: Square): Set<string> {
  const piece = game.get(square);

  if (!piece) {
    return new Set();
  }

  let position = game;

  if (piece.color !== game.turn()) {
    const fenParts = game.fen().split(" ");
    fenParts[1] = piece.color;
    fenParts[3] = "-";
    position = new Chess(fenParts.join(" "));
  }

  const moves = position.moves({ square, verbose: true });

  return new Set(
    moves.map((move) => {
      return move.to;
    }),
  );
}

export function getSquareCenter(square: Square, orientation: BoardOrientation) {
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

export function getSquareFromPoint(
  x: number,
  y: number,
  boardElement: HTMLDivElement,
  orientation: BoardOrientation,
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

export function getArrowPoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
): ArrowPoints | null {
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
  const tipOffset = Math.max(0, Math.min(38, length * 0.22) - 7);
  const headLength = Math.min(52, length * 0.52);
  const headWidth = Math.min(52, length * 0.52);
  const tipX = to.x - unitX * tipOffset;
  const tipY = to.y - unitY * tipOffset;
  const baseX = tipX - unitX * headLength;
  const baseY = tipY - unitY * headLength;
  const halfWidth = headWidth / 2;

  const leftX = baseX + perpX * halfWidth;
  const leftY = baseY + perpY * halfWidth;
  const rightX = baseX - perpX * halfWidth;
  const rightY = baseY - perpY * halfWidth;

  return {
    x1: from.x,
    y1: from.y,
    x2: tipX,
    y2: tipY,
    head: `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`,
  };
}

export function createDisplayArrow(
  arrow: BoardArrow,
  orientation: BoardOrientation,
  key: string,
  color: string,
  opacity: number,
): DisplayArrow | null {
  const from = getSquareCenter(arrow.from, orientation);
  const to = getSquareCenter(arrow.to, orientation);

  if (!from || !to) {
    return null;
  }

  const points = getArrowPoints(from, to);

  if (!points) {
    return null;
  }

  return {
    key,
    color,
    opacity,
    ...points,
  };
}
