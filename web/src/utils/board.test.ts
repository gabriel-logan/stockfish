import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import {
  createDisplayArrow,
  getBoardCol,
  getBoardRow,
  getDisplayFiles,
  getDisplayRanks,
  getLegalTargets,
  isPromotionMove,
} from "./board";

describe("board helpers", () => {
  it("maps displayed rows and columns by orientation", () => {
    expect(getBoardRow(0, "w")).toBe(0);
    expect(getBoardCol(0, "w")).toBe(0);
    expect(getDisplayRanks("w")[0]).toBe("8");
    expect(getDisplayFiles("w")[0]).toBe("a");

    expect(getBoardRow(0, "b")).toBe(7);
    expect(getBoardCol(0, "b")).toBe(7);
    expect(getDisplayRanks("b")[0]).toBe("1");
    expect(getDisplayFiles("b")[0]).toBe("h");
  });

  it("finds legal targets for the selected piece color", () => {
    const game = new Chess();

    expect(getLegalTargets(game, "e2")).toEqual(new Set(["e3", "e4"]));
    expect(getLegalTargets(game, "e7")).toEqual(new Set(["e6", "e5"]));
  });

  it("detects legal pawn promotions", () => {
    const game = new Chess("8/P7/8/8/8/8/8/k6K w - - 0 1");

    expect(isPromotionMove(game, "a7", "a8")).toBe(true);
    expect(isPromotionMove(game, "a7", "b8")).toBe(false);
  });

  it("builds display arrows for valid square pairs", () => {
    const arrow = createDisplayArrow(
      { from: "a1", to: "h8" },
      "w",
      "test-arrow",
      "#fff",
      0.5,
    );

    expect(arrow).toMatchObject({
      key: "test-arrow",
      color: "#fff",
      opacity: 0.5,
    });
    expect(
      createDisplayArrow({ from: "a1", to: "a1" }, "w", "same", "#fff", 1),
    ).toBeNull();
  });
});
