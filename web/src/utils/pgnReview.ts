import { Chess, type Move, type Square } from "chess.js";

import type { ClassificationValue, PromotionPiece } from "../types/chess-types";
import type { MoveEntry } from "../types/moves";
import { AnalysisEngine, type AnalysisLine } from "./analysisEngine";
import { classifyMove } from "./classification";
import { getOpeningName } from "./openingNames";
import { getMoveUci, type PgnGameInfo } from "./pgn";

export type PgnSource = "paste" | "lichess" | "chesscom";

export const KNOWN_PGN_HEADER_LABELS: Record<string, string> = {
  Event: "Event",
  Site: "Site",
  Date: "Date",
  Round: "Round",
  White: "White",
  Black: "Black",
  Result: "Result",
  CurrentPosition: "Current position",
  WhiteElo: "White Elo",
  BlackElo: "Black Elo",
  WhiteTitle: "White title",
  BlackTitle: "Black title",
  TimeControl: "Time control",
  Termination: "Termination",
  ECO: "ECO",
  ECOUrl: "ECO URL",
  Opening: "Opening",
  Variant: "Variant",
  UTCDate: "UTC date",
  UTCTime: "UTC time",
  Timezone: "Timezone",
  StartTime: "Start time",
  EndDate: "End date",
  EndTime: "End time",
  Link: "Link",
};

const ACCURACY_CENTIPAWN_DECAY = 0.00368208;

export interface PositionData {
  fen: string;
  san?: string;
  color?: "w" | "b";
  from?: string;
  to?: string;
  uci?: string;
  clock?: string;
  elapsed?: string;
  comment?: string;
  evaluation: number | null;
  mate: number | null;
  bestmove?: string | null;
  lineCount?: number;
  lines?: AnalysisLine[];
  analysisComplete?: boolean;
  classification?: ClassificationValue;
}

interface AnalyzePgnPositionsOptions {
  onProgress: (progress: number) => void;
  onPositions: (positions: PositionData[]) => void;
}

interface CreatedPracticeMove {
  boardGame: Chess;
  move: Move;
  entry: MoveEntry;
  fenBefore: string;
}

interface AnalyzePracticeMoveParams {
  fenBefore: string;
  entry: MoveEntry;
  activePracticeMoves: MoveEntry[];
  positions: PositionData[];
  currentIdx: number;
}

export function getUciMoveParams(uciMove: string) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uciMove)) {
    return null;
  }

  return {
    from: uciMove.slice(0, 2) as Square,
    to: uciMove.slice(2, 4) as Square,
    promotion: (uciMove.slice(4, 5) || undefined) as PromotionPiece | undefined,
  };
}

export function getMoveParams(move: MoveEntry) {
  if (!move.from || !move.to) {
    return null;
  }

  return {
    from: move.from as Square,
    to: move.to as Square,
    promotion: (move.uci?.slice(4, 5) || undefined) as
      PromotionPiece | undefined,
  };
}

export function getFormattedScore(score: number | null, mate: number | null) {
  if (mate !== null) {
    if (Object.is(mate, -0) || mate === 0) {
      return "M0";
    }

    const prefix = mate > 0 ? "+" : "-";

    return `M${prefix}${Math.abs(mate)}`;
  }

  if (score === null) {
    return "-";
  }

  if (score > 0) {
    return `+${score.toFixed(2)}`;
  }

  return score.toFixed(2);
}

export function getSanLine(fen: string, pv: string[]) {
  const game = new Chess(fen);
  const moves: string[] = [];

  for (const uciMove of pv) {
    const params = getUciMoveParams(uciMove);

    if (!params) {
      break;
    }

    try {
      const move = game.move(params);

      if (!move) {
        break;
      }

      moves.push(move.san);
    } catch {
      break;
    }
  }

  return moves;
}

export function getKnownHeaderLabel(header: string) {
  return KNOWN_PGN_HEADER_LABELS[header] ?? header;
}

export function getResultLabel(result: string) {
  if (result === "1-0") {
    return "White won";
  }

  if (result === "0-1") {
    return "Black won";
  }

  if (result === "1/2-1/2") {
    return "Draw";
  }

  return result || "-";
}

export function getLatestClock(moves: MoveEntry[], color: "w" | "b") {
  for (let index = moves.length - 1; index >= 0; index--) {
    const move = moves[index];

    if (move.color === color && move.clock) {
      return move.clock;
    }
  }

  return null;
}

export function formatTimeControl(timeControl: string) {
  if (!timeControl || timeControl === "-") {
    return "-";
  }

  const [baseSeconds, incrementSeconds] = timeControl.split("+");
  const base = Number(baseSeconds);

  if (!Number.isFinite(base)) {
    return timeControl;
  }

  const minutes = Math.floor(base / 60);
  const seconds = base % 60;
  const baseLabel =
    seconds === 0
      ? `${minutes} min`
      : `${minutes}:${String(seconds).padStart(2, "0")}`;

  if (!incrementSeconds) {
    return baseLabel;
  }

  return `${baseLabel} + ${incrementSeconds}s`;
}

export function computeAccuracy(moveList: MoveEntry[], color: "w" | "b") {
  const accuracies = moveList.flatMap((move, index) => {
    if (move.color !== color) {
      return [];
    }

    const previousMove = moveList[index - 1];
    const evaluationBefore = move.evaluationBefore ?? previousMove?.evaluation;
    const mateBefore = move.mateBefore ?? previousMove?.mate ?? null;
    const accuracy = getMoveAccuracy(
      move,
      getPracticalScore(
        evaluationBefore ?? null,
        mateBefore,
        move.color === "w" ? "b" : "w",
      ),
    );

    if (accuracy === null) {
      return [];
    }

    return [accuracy];
  });

  if (accuracies.length === 0) {
    return "-";
  }

  const averageAccuracy =
    accuracies.reduce((total, accuracy) => total + accuracy, 0) /
    accuracies.length;

  return averageAccuracy.toFixed(1);
}

function getPracticalScore(
  evaluation: number | null,
  mate: number | null,
  color: "w" | "b",
): number | null {
  if (mate !== null) {
    if (mate === 0) {
      return color === "w" ? 1000 : -1000;
    }

    if (mate > 0) {
      return 1000 - mate;
    }

    return -1000 - mate;
  }

  return evaluation;
}

function getMoveAccuracy(
  move: MoveEntry,
  scoreBefore: number | null,
): number | null {
  const scoreAfter = getPracticalScore(
    move.evaluation ?? null,
    move.mate ?? null,
    move.color,
  );

  if (scoreBefore === null || scoreAfter === null) {
    return null;
  }

  const scoreLoss =
    move.color === "w" ? scoreBefore - scoreAfter : scoreAfter - scoreBefore;
  const centipawnLoss = Math.max(0, scoreLoss * 100);

  return 100 * Math.exp(-ACCURACY_CENTIPAWN_DECAY * centipawnLoss);
}

export function shouldDeepenAnalysis(
  evaluationBefore: number | null,
  evaluationAfter: number | null,
  mateBefore: number | null,
  mateAfter: number | null,
  color: "w" | "b",
) {
  if (mateBefore !== mateAfter && (mateBefore !== null || mateAfter !== null)) {
    return true;
  }

  if (evaluationBefore === null || evaluationAfter === null) {
    return false;
  }

  const colorMultiplier = color === "w" ? 1 : -1;
  const scoreLoss = (evaluationBefore - evaluationAfter) * colorMultiplier;

  return scoreLoss >= 0.5;
}

export function getMainLineMoves(positions: PositionData[]): MoveEntry[] {
  return positions.flatMap((position, index) => {
    if (!position.san || !position.color) {
      return [];
    }

    const previousPosition = positions[index - 1];

    return [
      {
        san: position.san,
        fen: position.fen,
        color: position.color,
        from: position.from,
        to: position.to,
        uci: position.uci,
        clock: position.clock,
        elapsed: position.elapsed,
        comment: position.comment,
        classification: position.classification,
        evaluationBefore: previousPosition?.evaluation ?? undefined,
        mateBefore: previousPosition?.mate ?? undefined,
        evaluation: position.evaluation ?? undefined,
        mate: position.mate ?? undefined,
      },
    ];
  });
}

export function createPgnPositions(
  pgnInput: string,
  parsedGameInfo: PgnGameInfo,
): PositionData[] {
  const game = new Chess();
  game.loadPgn(pgnInput);

  const history = game.history({ verbose: true });
  const positions: PositionData[] = [];

  if (history.length > 0) {
    positions.push({ fen: history[0].before, evaluation: null, mate: null });

    for (const [index, move] of history.entries()) {
      const moveInfo = parsedGameInfo.moveInfo[index] ?? {};

      positions.push({
        fen: move.after,
        san: move.san,
        color: move.color as "w" | "b",
        from: move.from,
        to: move.to,
        uci: getMoveUci(move),
        clock: moveInfo.clock,
        elapsed: moveInfo.elapsed,
        comment: moveInfo.comment,
        evaluation: null,
        mate: null,
      });
    }
  } else {
    positions.push({ fen: game.fen(), evaluation: null, mate: null });
  }

  return positions;
}

export async function analyzePgnPositions(
  positions: PositionData[],
  { onProgress, onPositions }: AnalyzePgnPositionsOptions,
): Promise<PositionData[]> {
  const engine = new AnalysisEngine();

  await engine.connect();

  try {
    for (let index = 0; index < positions.length; index++) {
      try {
        let result = await engine.analyzePosition(positions[index].fen, 10, 3);
        let evaluationBefore = positions[index - 1]?.evaluation ?? null;
        let mateBefore = positions[index - 1]?.mate ?? null;
        let linesBefore = positions[index - 1]?.lines;
        let bestMoveBefore = positions[index - 1]?.bestmove;
        let analysisCompleteBefore =
          positions[index - 1]?.analysisComplete ?? false;
        let deepened = false;
        const color = positions[index].color;

        if (
          index > 0 &&
          color &&
          shouldDeepenAnalysis(
            evaluationBefore,
            result.score,
            mateBefore,
            result.mate,
            color,
          )
        ) {
          const before = await engine.analyzePosition(
            positions[index - 1].fen,
            14,
            3,
          );

          result = await engine.analyzePosition(positions[index].fen, 14, 3);
          evaluationBefore = before.score;
          mateBefore = before.mate;
          linesBefore = before.lines;
          bestMoveBefore = before.bestmove;
          analysisCompleteBefore = before.completed;
          deepened = true;
        }

        positions[index].evaluation = result.score;
        positions[index].mate = result.mate;
        positions[index].bestmove = result.bestmove;
        positions[index].lineCount = result.lines.length;
        positions[index].lines = result.lines;
        positions[index].analysisComplete = result.completed;

        if (index > 0 && color && analysisCompleteBefore && result.completed) {
          const alternativeLine = linesBefore?.find((line) => {
            return line.pv[0] !== positions[index].uci;
          });

          positions[index].classification = classifyMove(
            evaluationBefore,
            result.score,
            color,
            mateBefore,
            result.mate,
            bestMoveBefore === positions[index].uci,
            deepened && linesBefore?.length === 1,
            getOpeningName(positions[index].fen) !== null,
            {
              fenBefore: positions[index - 1].fen,
              playedMove: positions[index].uci,
              bestLinePvAfter: result.lines[0]?.pv,
              alternativeEvalBefore: alternativeLine?.score,
              alternativeMateBefore: alternativeLine?.mate,
              fenTwoMovesAgo: positions[index - 2]?.fen ?? null,
              previousMove: positions[index - 1].uci ?? null,
            },
          );
        }

        onProgress(5 + ((index + 1) / positions.length) * 90);
        onPositions([...positions]);
      } catch {
        // Keep the remaining review usable when one position cannot be analyzed.
      }
    }
  } finally {
    engine.disconnect();
  }

  return positions;
}

export function getGameAtPgnPosition(
  positions: PositionData[],
  positionIndex: number,
): Chess {
  const game = new Chess();

  if (positions.length === 0) {
    return game;
  }

  const startFen = positions[0]?.fen;

  if (startFen && startFen !== new Chess().fen()) {
    try {
      game.load(startFen);
    } catch {
      // Retain the default position when the stored starting FEN is invalid.
    }
  }

  for (let index = 1; index <= positionIndex; index++) {
    const position = positions[index];

    if (!position?.san) {
      continue;
    }

    try {
      game.move(position.san);
    } catch {
      break;
    }
  }

  return game;
}

export function getGameWithPractice(
  positions: PositionData[],
  currentIdx: number,
  practiceMoves: MoveEntry[],
  cursor: number,
): Chess {
  const game =
    positions.length > 0
      ? getGameAtPgnPosition(positions, currentIdx)
      : new Chess();

  for (let index = 0; index < cursor; index++) {
    const params = getMoveParams(practiceMoves[index]);

    if (!params) {
      continue;
    }

    try {
      game.move(params);
    } catch {
      break;
    }
  }

  return game;
}

export function getLastMoveForGame(game: Chess) {
  const history = game.history({ verbose: true });

  if (history.length === 0) {
    return null;
  }

  const last = history[history.length - 1];

  return { from: last.from as Square, to: last.to as Square };
}

export function createPracticeMove(
  gameAtIdx: Chess,
  from: Square,
  to: Square,
  promotion: PromotionPiece,
): CreatedPracticeMove | null {
  try {
    const boardGame = new Chess(gameAtIdx.fen());
    const fenBefore = boardGame.fen();
    const move = boardGame.move({ from, to, promotion });

    if (!move) {
      return null;
    }

    return {
      boardGame,
      move,
      fenBefore,
      entry: {
        san: move.san,
        fen: boardGame.fen(),
        color: move.color as "w" | "b",
        from: move.from,
        to: move.to,
        uci: getMoveUci(move),
        captured: move.captured as MoveEntry["captured"],
        isManual: true,
      },
    };
  } catch {
    return null;
  }
}

export async function analyzePracticeMove({
  fenBefore,
  entry,
  activePracticeMoves,
  positions,
  currentIdx,
}: AnalyzePracticeMoveParams): Promise<Partial<MoveEntry>> {
  if (!entry.uci) {
    return {};
  }

  const engine = new AnalysisEngine();

  await engine.connect();

  try {
    const before = await engine.analyzePosition(fenBefore, 14, 3);
    const after = await engine.analyzePosition(entry.fen, 14);
    const alternativeLine = before.lines.find((line) => {
      return line.pv[0] !== entry.uci;
    });
    const previousPracticeMove =
      activePracticeMoves[activePracticeMoves.length - 1];
    const previousMainMove =
      positions.length > 0 ? positions[currentIdx]?.uci : null;
    const fenTwoMovesAgo =
      activePracticeMoves[activePracticeMoves.length - 2]?.fen ??
      positions[currentIdx - 1]?.fen ??
      null;

    return {
      classification: classifyMove(
        before.score,
        after.score,
        entry.color,
        before.mate,
        after.mate,
        before.bestmove === entry.uci,
        before.lines.length === 1,
        getOpeningName(entry.fen) !== null,
        {
          fenBefore,
          playedMove: entry.uci,
          bestLinePvAfter: after.lines[0]?.pv,
          alternativeEvalBefore: alternativeLine?.score,
          alternativeMateBefore: alternativeLine?.mate,
          fenTwoMovesAgo,
          previousMove: previousPracticeMove?.uci ?? previousMainMove,
        },
      ),
      evaluationBefore: before.score ?? undefined,
      mateBefore: before.mate ?? undefined,
      evaluation: after.score ?? undefined,
      mate: after.mate ?? undefined,
    };
  } finally {
    engine.disconnect();
  }
}
