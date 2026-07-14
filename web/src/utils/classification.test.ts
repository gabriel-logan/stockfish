import { describe, expect, it } from "vitest";

import { MoveClassification } from "../constants";
import { classifyMove } from "./classification";

describe("classifyMove", () => {
  it.each([
    {
      name: "keeps a quiet move excellent",
      evaluationBefore: 0.2,
      evaluationAfter: 0.1,
      color: "w" as const,
      expected: MoveClassification.Excellent,
    },
    {
      name: "detects a white blunder",
      evaluationBefore: 2,
      evaluationAfter: -2,
      color: "w" as const,
      expected: MoveClassification.Blunder,
    },
    {
      name: "detects a black blunder",
      evaluationBefore: -2,
      evaluationAfter: 2,
      color: "b" as const,
      expected: MoveClassification.Blunder,
    },
  ])("$name", ({ evaluationBefore, evaluationAfter, color, expected }) => {
    expect(classifyMove(evaluationBefore, evaluationAfter, color)).toBe(
      expected,
    );
  });

  it("preserves a known best move", () => {
    expect(classifyMove(0, 0, "w", null, null, true)).toBe(
      MoveClassification.Best,
    );
  });

  it("preserves an opening move", () => {
    expect(classifyMove(0, 0, "w", null, null, false, false, true)).toBe(
      MoveClassification.Opening,
    );
  });

  it("detects a lost forced mate", () => {
    expect(classifyMove(null, null, "w", 3, -3)).toBe(
      MoveClassification.Blunder,
    );
  });
});
