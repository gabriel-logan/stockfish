import type { Game } from "../types/api";

export interface ClockAnchor {
  gameId: string;
  moveCount: number;
  sideToMove: string;
  serverTimeMs: number;
  receivedAt: number;
}

export function getMonotonicTime() {
  if (typeof performance !== "undefined") {
    return performance.now();
  }

  return Date.now();
}

export function isNewerGameSnapshot(currentGame: Game | null, nextGame: Game) {
  if (!currentGame || currentGame.id !== nextGame.id) {
    return true;
  }

  if (nextGame.moveCount !== currentGame.moveCount) {
    return nextGame.moveCount > currentGame.moveCount;
  }

  if (nextGame.status !== currentGame.status) {
    return currentGame.status !== "finished" && nextGame.status === "finished";
  }

  const currentLastMoveAt = Date.parse(currentGame.lastMoveAt);
  const nextLastMoveAt = Date.parse(nextGame.lastMoveAt);

  return nextLastMoveAt > currentLastMoveAt;
}

export function createClockAnchor(
  game: Game,
  serverTime: string | undefined,
  receivedAt: number,
): ClockAnchor {
  return {
    gameId: game.id,
    moveCount: game.moveCount,
    sideToMove: game.sideToMove,
    serverTimeMs: serverTime == null ? Number.NaN : Date.parse(serverTime),
    receivedAt,
  };
}

export function getDisplayedClockMs(
  game: Game,
  color: "white" | "black",
  now: number,
  anchor: ClockAnchor | null,
) {
  const storedClockMs =
    color === "white" ? game.whiteClockMs : game.blackClockMs;

  if (game.status !== "active" || game.sideToMove !== color) {
    return Math.max(0, storedClockMs);
  }

  if (
    !anchor ||
    anchor.gameId !== game.id ||
    anchor.moveCount !== game.moveCount ||
    anchor.sideToMove !== game.sideToMove ||
    Number.isNaN(anchor.serverTimeMs)
  ) {
    return Math.max(0, storedClockMs);
  }

  const serverNowMs =
    anchor.serverTimeMs + Math.max(0, now - anchor.receivedAt);
  const lastMoveAtMs = Date.parse(game.lastMoveAt);

  if (Number.isNaN(lastMoveAtMs)) {
    return Math.max(0, storedClockMs);
  }

  const elapsedMs = Math.max(0, serverNowMs - lastMoveAtMs);

  return Math.max(0, storedClockMs - elapsedMs);
}
