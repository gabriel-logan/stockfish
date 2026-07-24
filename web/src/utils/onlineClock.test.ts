import { describe, expect, it } from "vitest";

import type { Game } from "../types/api";
import {
  createClockAnchor,
  getDisplayedClockMs,
  isNewerGameSnapshot,
} from "./onlineClock";

const baseGame: Game = {
  id: "game-1",
  roomId: "room-1",
  whiteUserId: "white-1",
  blackUserId: "black-1",
  status: "active",
  result: null,
  resultReason: null,
  fen: "start",
  pgn: "",
  sideToMove: "white",
  moveCount: 0,
  whiteClockMs: 60_000,
  blackClockMs: 60_000,
  lastMoveAt: "2026-07-24T15:00:00.000Z",
  startedAt: "2026-07-24T15:00:00.000Z",
  finishedAt: null,
};

describe("online clock", () => {
  it("rejects a stale snapshot after a newer move", () => {
    const nextGame = {
      ...baseGame,
      sideToMove: "black",
      moveCount: 1,
      lastMoveAt: "2026-07-24T15:00:04.000Z",
    };

    expect(isNewerGameSnapshot(baseGame, nextGame)).toBe(true);
    expect(isNewerGameSnapshot(nextGame, baseGame)).toBe(false);
  });

  it("accepts a finished snapshot at the same move count", () => {
    const finishedGame = {
      ...baseGame,
      status: "finished",
      result: "black_win",
      resultReason: "timeout",
    };

    expect(isNewerGameSnapshot(baseGame, finishedGame)).toBe(true);
    expect(isNewerGameSnapshot(finishedGame, baseGame)).toBe(false);
  });

  it("uses a monotonic elapsed interval against server time", () => {
    const anchor = createClockAnchor(
      baseGame,
      "2026-07-24T15:00:05.000Z",
      1_000,
    );

    expect(getDisplayedClockMs(baseGame, "white", 3_500, anchor)).toBe(52_500);
  });

  it("does not add elapsed time after a monotonic clock reset", () => {
    const anchor = createClockAnchor(
      baseGame,
      "2026-07-24T15:00:05.000Z",
      1_000,
    );

    expect(getDisplayedClockMs(baseGame, "white", 500, anchor)).toBe(55_000);
  });
});
