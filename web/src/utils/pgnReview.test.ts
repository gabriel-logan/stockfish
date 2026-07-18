import { describe, expect, it } from "vitest";

import { parsePgnGameInfo } from "./pgn";
import {
  computeAccuracy,
  createPgnPositions,
  createPracticeMove,
  formatTimeControl,
  getFormattedScore,
  getGameAtPgnPosition,
  getGameWithPractice,
  getKnownHeaderLabel,
  getMainLineMoves,
  getResultLabel,
  getSanLine,
  getUciMoveParams,
  shouldDeepenAnalysis,
} from "./pgnReview";

const SAMPLE_PGN = `[Event "Test"]
[White "Ada"]
[Black "Grace"]
[Result "1-0"]

1. e4 {[%clk 0:05:00] center} e5 2. Nf3 Nc6 1-0`;

describe("PGN review helpers", () => {
  it("formats engine scores and time controls", () => {
    expect(getFormattedScore(0.42, null)).toBe("+0.42");
    expect(getFormattedScore(-1.5, null)).toBe("-1.50");
    expect(getFormattedScore(null, 3)).toBe("M+3");
    expect(getFormattedScore(null, -0)).toBe("M0");

    expect(formatTimeControl("300+5")).toBe("5 min + 5s");
    expect(formatTimeControl("90")).toBe("1:30");
    expect(formatTimeControl("-")).toBe("-");
  });

  it("converts UCI principal variations to SAN", () => {
    expect(getUciMoveParams("e2e4")).toEqual({
      from: "e2",
      to: "e4",
      promotion: undefined,
    });

    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    expect(getSanLine(startFen, ["e2e4", "e7e5"])).toEqual(["e4", "e5"]);
  });

  it("creates position and move data from PGN", () => {
    const gameInfo = parsePgnGameInfo(SAMPLE_PGN);
    const positions = createPgnPositions(SAMPLE_PGN, gameInfo);
    const mainLineMoves = getMainLineMoves(positions);

    expect(positions).toHaveLength(5);
    expect(positions[1]).toMatchObject({
      san: "e4",
      color: "w",
      from: "e2",
      to: "e4",
      uci: "e2e4",
      clock: "0:05:00",
      comment: "center",
    });
    expect(mainLineMoves).toHaveLength(4);
    expect(mainLineMoves[0].san).toBe("e4");
  });

  it("reconstructs mainline and practice games", () => {
    const gameInfo = parsePgnGameInfo(SAMPLE_PGN);
    const positions = createPgnPositions(SAMPLE_PGN, gameInfo);
    const gameAtSecondMove = getGameAtPgnPosition(positions, 2);
    const practiceMove = createPracticeMove(gameAtSecondMove, "g1", "f3", "q");

    expect(gameAtSecondMove.turn()).toBe("w");
    expect(practiceMove?.entry).toMatchObject({
      san: "Nf3",
      uci: "g1f3",
      isManual: true,
    });

    const practiceGame = getGameWithPractice(
      positions,
      2,
      practiceMove ? [practiceMove.entry] : [],
      1,
    );

    expect(practiceGame.get("f3")).toMatchObject({ type: "n", color: "w" });
  });

  it("summarizes labels, accuracy, and deepening decisions", () => {
    expect(getKnownHeaderLabel("WhiteElo")).toBe("White Elo");
    expect(getKnownHeaderLabel("Custom")).toBe("Custom");
    expect(getResultLabel("1/2-1/2")).toBe("Draw");
    expect(getResultLabel("")).toBe("-");

    expect(
      computeAccuracy(
        [
          { san: "e4", fen: "fen", color: "w", classification: "best" },
          { san: "e5", fen: "fen", color: "b", classification: "mistake" },
          { san: "Nf3", fen: "fen", color: "w", classification: "excellent" },
        ],
        "w",
      ),
    ).toBe("100.0");

    expect(shouldDeepenAnalysis(1, 0.2, null, null, "w")).toBe(true);
    expect(shouldDeepenAnalysis(-1, -0.2, null, null, "b")).toBe(true);
    expect(shouldDeepenAnalysis(0.1, 0, null, null, "w")).toBe(false);
  });
});
