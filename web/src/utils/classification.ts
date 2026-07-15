import { Chess, type PieceSymbol, type Square } from "chess.js";

import { MoveClassification } from "../constants";
import type { ClassificationValue } from "../types/chess-types";

interface MoveClassificationContext {
  fenBefore?: string;
  playedMove?: string;
  bestLinePvAfter?: string[];
  alternativeEvalBefore?: number | null;
  alternativeMateBefore?: number | null;
  fenTwoMovesAgo?: string | null;
  previousMove?: string | null;
}

function getWinPercentage(
  evaluation: number | null,
  mate: number | null,
): number | null {
  if (mate !== null) {
    if (mate > 0) {
      return 100;
    }

    if (mate < 0) {
      return 0;
    }
  }

  if (evaluation === null) {
    return null;
  }

  const centipawns = Math.max(-1000, Math.min(1000, evaluation * 100));
  const winningChances = 2 / (1 + Math.exp(-0.00368208 * centipawns)) - 1;

  return 50 + 50 * winningChances;
}

function getRequiredWinPercentage(
  evaluation: number | null,
  mate: number | null,
): number {
  return getWinPercentage(evaluation, mate) ?? 50;
}

function getPracticalScore(
  evaluation: number | null,
  mate: number | null,
): number | null {
  if (mate !== null) {
    if (mate > 0) {
      return 1000 - mate;
    }

    if (mate < 0) {
      return -1000 - mate;
    }
  }

  return evaluation;
}

function getPieceValue(piece: PieceSymbol): number {
  switch (piece) {
    case "p":
      return 1;
    case "n":
    case "b":
      return 3;
    case "r":
      return 5;
    case "q":
      return 9;
    default:
      return 0;
  }
}

function getMaterialDifference(fen: string): number {
  const game = new Chess(fen);
  const squares = game.board().flat();

  return squares.reduce((total, square) => {
    if (!square) {
      return total;
    }

    const value = getPieceValue(square.type);

    if (square.color === "w") {
      return total + value;
    }

    return total - value;
  }, 0);
}

function getUciMoveParams(uciMove: string): {
  from: Square;
  to: Square;
  promotion?: string;
} {
  return {
    from: uciMove.slice(0, 2) as Square,
    to: uciMove.slice(2, 4) as Square,
    promotion: uciMove.slice(4, 5) || undefined,
  };
}

function isSimplePieceRecapture(
  fen: string | null | undefined,
  previousMove: string | null | undefined,
  playedMove: string | null | undefined,
): boolean {
  if (!fen || !previousMove || !playedMove) {
    return false;
  }

  const firstMove = getUciMoveParams(previousMove);
  const secondMove = getUciMoveParams(playedMove);

  if (firstMove.to !== secondMove.to) {
    return false;
  }

  const game = new Chess(fen);

  return !!game.get(firstMove.to);
}

function isPieceSacrifice(
  fen: string | undefined,
  playedMove: string | undefined,
  bestLinePvAfter: string[] | undefined,
): boolean {
  if (!fen || !playedMove || !bestLinePvAfter?.length) {
    return false;
  }

  const game = new Chess(fen);
  const whiteToPlay = game.turn() === "w";
  const startingMaterialDifference = getMaterialDifference(fen);
  const moves = [playedMove, ...bestLinePvAfter];
  const balancedLine = moves.length % 2 === 1 ? moves.slice(0, -1) : moves;
  const capturedPieces: { w: PieceSymbol[]; b: PieceSymbol[] } = {
    w: [],
    b: [],
  };
  let allowedQuietMoves = 1;

  for (const move of balancedLine) {
    try {
      const fullMove = game.move(getUciMoveParams(move));

      if (!fullMove) {
        return false;
      }

      if (fullMove.captured) {
        capturedPieces[fullMove.color].push(fullMove.captured);
        allowedQuietMoves = 1;
      } else {
        allowedQuietMoves -= 1;

        if (allowedQuietMoves < 0) {
          break;
        }
      }
    } catch {
      return false;
    }
  }

  for (const piece of [...capturedPieces.w]) {
    const matchingIndex = capturedPieces.b.indexOf(piece);

    if (matchingIndex === -1) {
      continue;
    }

    capturedPieces.b.splice(matchingIndex, 1);
    capturedPieces.w.splice(capturedPieces.w.indexOf(piece), 1);
  }

  const remainingCaptures = capturedPieces.w.concat(capturedPieces.b);

  if (
    Math.abs(capturedPieces.w.length - capturedPieces.b.length) <= 1 &&
    remainingCaptures.every((piece) => piece === "p")
  ) {
    return false;
  }

  const endingMaterialDifference = getMaterialDifference(game.fen());
  const materialDiff = endingMaterialDifference - startingMaterialDifference;
  const playerMaterialDiff = whiteToPlay ? materialDiff : -materialDiff;

  return playerMaterialDiff < 0;
}

function getClassificationRank(classification: ClassificationValue): number {
  switch (classification) {
    case MoveClassification.Blunder:
      return 5;
    case MoveClassification.Mistake:
      return 4;
    case MoveClassification.Inaccuracy:
      return 3;
    case MoveClassification.Okay:
      return 2;
    case MoveClassification.Excellent:
      return 1;
    default:
      return 0;
  }
}

function getLeastSevereClassification(
  first: ClassificationValue,
  second: ClassificationValue,
): ClassificationValue {
  if (getClassificationRank(first) <= getClassificationRank(second)) {
    return first;
  }

  return second;
}

function classifyWinPercentageLoss(
  winPercentageLoss: number,
): ClassificationValue {
  if (winPercentageLoss > 20) {
    return MoveClassification.Blunder;
  }

  if (winPercentageLoss > 10) {
    return MoveClassification.Mistake;
  }

  if (winPercentageLoss > 5) {
    return MoveClassification.Inaccuracy;
  }

  if (winPercentageLoss > 2) {
    return MoveClassification.Okay;
  }

  return MoveClassification.Excellent;
}

function classifyScoreLoss(scoreLoss: number): ClassificationValue {
  if (scoreLoss > 2.5) {
    return MoveClassification.Blunder;
  }

  if (scoreLoss > 1.2) {
    return MoveClassification.Mistake;
  }

  if (scoreLoss > 0.5) {
    return MoveClassification.Inaccuracy;
  }

  if (scoreLoss > 0.2) {
    return MoveClassification.Okay;
  }

  return MoveClassification.Excellent;
}

function isLosingOrAlternativeCompletelyWinning(
  winAfter: number,
  alternativeWinBefore: number,
  color: "w" | "b",
): boolean {
  if (color === "w") {
    return winAfter < 50 || alternativeWinBefore > 97;
  }

  return winAfter > 50 || alternativeWinBefore < 3;
}

function changedGameOutcome(
  winBefore: number,
  winAfter: number,
  color: "w" | "b",
): boolean {
  const multiplier = color === "w" ? 1 : -1;
  const diff = (winAfter - winBefore) * multiplier;

  return (
    diff > 10 &&
    ((winBefore < 50 && winAfter > 50) || (winBefore > 50 && winAfter < 50))
  );
}

function isOnlyGoodMove(
  winAfter: number,
  alternativeWinBefore: number,
  color: "w" | "b",
): boolean {
  const multiplier = color === "w" ? 1 : -1;
  const diff = (winAfter - alternativeWinBefore) * multiplier;

  return diff > 10;
}

function isSpecialMoveCandidate(
  winBefore: number,
  winAfter: number,
  color: "w" | "b",
): boolean {
  const multiplier = color === "w" ? 1 : -1;
  const diff = (winAfter - winBefore) * multiplier;

  return diff >= -2;
}

export function classifyMove(
  evalBefore: number | null,
  evalAfter: number | null,
  color: "w" | "b",
  mateBefore: number | null = null,
  mateAfter: number | null = null,
  wasBestMove: boolean = false,
  isForced: boolean = false,
  isOpening: boolean = false,
  context: MoveClassificationContext = {},
): ClassificationValue {
  if (mateAfter === 0) {
    return MoveClassification.Best;
  }

  if (isOpening) {
    return MoveClassification.Opening;
  }

  if (isForced) {
    return MoveClassification.Forced;
  }

  const winBefore = getWinPercentage(evalBefore, mateBefore);
  const winAfter = getWinPercentage(evalAfter, mateAfter);
  const scoreBefore = getPracticalScore(evalBefore, mateBefore);
  const scoreAfter = getPracticalScore(evalAfter, mateAfter);

  if (
    winBefore === null ||
    winAfter === null ||
    scoreBefore === null ||
    scoreAfter === null
  ) {
    return MoveClassification.Okay;
  }

  const alternativeWinBefore =
    context.alternativeEvalBefore !== undefined ||
    context.alternativeMateBefore !== undefined
      ? getRequiredWinPercentage(
          context.alternativeEvalBefore ?? null,
          context.alternativeMateBefore ?? null,
        )
      : null;

  if (
    alternativeWinBefore !== null &&
    isSpecialMoveCandidate(winBefore, winAfter, color) &&
    isPieceSacrifice(
      context.fenBefore,
      context.playedMove,
      context.bestLinePvAfter,
    ) &&
    !isLosingOrAlternativeCompletelyWinning(
      winAfter,
      alternativeWinBefore,
      color,
    )
  ) {
    return MoveClassification.Splendid;
  }

  if (
    alternativeWinBefore !== null &&
    isSpecialMoveCandidate(winBefore, winAfter, color) &&
    !isSimplePieceRecapture(
      context.fenTwoMovesAgo,
      context.previousMove,
      context.playedMove,
    ) &&
    !isLosingOrAlternativeCompletelyWinning(
      winAfter,
      alternativeWinBefore,
      color,
    ) &&
    (changedGameOutcome(winBefore, winAfter, color) ||
      isOnlyGoodMove(winAfter, alternativeWinBefore, color))
  ) {
    return MoveClassification.Perfect;
  }

  if (wasBestMove) {
    return MoveClassification.Best;
  }

  const colorMultiplier = color === "w" ? 1 : -1;
  const winPercentageLoss = (winBefore - winAfter) * colorMultiplier;
  const scoreLoss = (scoreBefore - scoreAfter) * colorMultiplier;

  return getLeastSevereClassification(
    classifyWinPercentageLoss(winPercentageLoss),
    classifyScoreLoss(scoreLoss),
  );
}
