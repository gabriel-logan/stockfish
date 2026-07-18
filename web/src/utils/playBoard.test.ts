import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import {
  createClearedEditedGame,
  createEditedGameWithTurn,
  createMoveEntry,
  createPlayGamePgn,
  getCapturedMaterial,
  getGameResult,
  moveEditedPieceInGame,
  placeEditedPiece,
} from "./playBoard";

describe("play board helpers", () => {
  it("creates move entries with UCI and capture metadata", () => {
    const game = new Chess();
    const firstMove = game.move("e4");
    game.move("d5");
    const capture = game.move("exd5");

    expect(createMoveEntry(firstMove, game.fen())).toMatchObject({
      san: "e4",
      color: "w",
      from: "e2",
      to: "e4",
      uci: "e2e4",
    });
    expect(createMoveEntry(capture, game.fen())).toMatchObject({
      san: "exd5",
      captured: "p",
      uci: "e4d5",
    });
  });

  it("calculates captured material", () => {
    const game = new Chess();
    game.move("e4");
    game.move("d5");
    const capture = game.move("exd5");
    const material = getCapturedMaterial([
      createMoveEntry(capture, game.fen()),
    ]);

    expect(material.pieces.w).toEqual(["p"]);
    expect(material.pieces.b).toEqual([]);
    expect(material.whiteValue).toBe(1);
    expect(material.blackValue).toBe(0);
    expect(material.materialScore).toBe(1);
  });

  it("gets the current game result", () => {
    const game = new Chess();

    expect(getGameResult(game)).toBe("*");

    game.move("f3");
    game.move("e5");
    game.move("g4");
    game.move("Qh4#");

    expect(getGameResult(game)).toBe("0-1");
  });

  it("creates annotated PGN headers for saved games", () => {
    const game = new Chess();
    game.move("e4");

    const pgn = createPlayGamePgn({
      game,
      date: new Date(2024, 0, 2),
      freePlay: false,
      playerColor: "w",
      playerName: "Ada",
      botElo: 1400,
      openingName: "King's Pawn Game",
      selfOpponentLabel: "Self",
    });

    expect(pgn).toContain('[Event "GLFish Game"]');
    expect(pgn).toContain('[Date "2024.01.02"]');
    expect(pgn).toContain('[White "Ada"]');
    expect(pgn).toContain('[Black "Stockfish 1400"]');
    expect(pgn).toContain('[BlackElo "1400"]');
    expect(pgn).toContain('[Opening "King\'s Pawn Game"]');
  });

  it("edits positions without applying move legality", () => {
    const game = new Chess();
    const movedGame = moveEditedPieceInGame(game, "b1", "c3");

    expect(movedGame?.get("b1")).toBeUndefined();
    expect(movedGame?.get("c3")).toMatchObject({ type: "n", color: "w" });

    const invalidKingPlacement = placeEditedPiece(game, "a3", {
      type: "k",
      color: "w",
    });

    expect(invalidKingPlacement).toBeNull();
  });

  it("creates editable board variants", () => {
    const game = new Chess();
    const cleared = createClearedEditedGame("b");
    const blackToMove = createEditedGameWithTurn(game, "b");

    expect(
      cleared
        .board()
        .flat()
        .every((piece) => piece === null),
    ).toBe(true);
    expect(cleared.turn()).toBe("b");
    expect(blackToMove.turn()).toBe("b");
  });
});
