import {
  Chess,
  type Color,
  type Move,
  type PieceSymbol,
  type Square,
} from "chess.js";

import type { MoveEntry } from "../types/moves";
import { formatPgnDate, getMoveUci } from "./pgn";

export const BOT_MOVE_DELAY_MS = 1000;
export const ENGINE_DISCONNECT_NOTICE_DELAY_MS = 6000;
export const CAPTURED_PIECE_ORDER = ["q", "r", "b", "n", "p"] as const;
export const EDIT_PIECES: PieceSymbol[] = ["k", "q", "r", "b", "n", "p"];
export const PIECE_VALUES = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
} as const;
export const CAPTURED_PIECE_ALT_KEYS = {
  w: {
    p: "board.whitePawn",
    n: "board.whiteKnight",
    b: "board.whiteBishop",
    r: "board.whiteRook",
    q: "board.whiteQueen",
  },
  b: {
    p: "board.blackPawn",
    n: "board.blackKnight",
    b: "board.blackBishop",
    r: "board.blackRook",
    q: "board.blackQueen",
  },
} as const;

export type CapturedPiece = (typeof CAPTURED_PIECE_ORDER)[number];
export type EditPiece = { type: PieceSymbol; color: Color } | "remove" | null;

interface CreatePlayGamePgnParams {
  game: Chess;
  date: Date;
  freePlay: boolean;
  playerColor: "w" | "b";
  playerName: string;
  botElo: number;
  openingName: string | null;
  selfOpponentLabel: string;
}

export function getCapturedPieces(moves: MoveEntry[]) {
  const capturedByWhite: CapturedPiece[] = [];
  const capturedByBlack: CapturedPiece[] = [];

  for (const move of moves) {
    if (!move.captured) {
      continue;
    }

    if (move.color === "w") {
      capturedByWhite.push(move.captured);
    } else {
      capturedByBlack.push(move.captured);
    }
  }

  return {
    w: capturedByWhite,
    b: capturedByBlack,
  };
}

export function getCapturedValue(pieces: CapturedPiece[]) {
  return pieces.reduce((total, piece) => {
    return total + PIECE_VALUES[piece];
  }, 0);
}

export function getCapturedMaterial(moves: MoveEntry[]) {
  const pieces = getCapturedPieces(moves);
  const whiteValue = getCapturedValue(pieces.w);
  const blackValue = getCapturedValue(pieces.b);

  return {
    pieces,
    whiteValue,
    blackValue,
    materialScore: whiteValue - blackValue,
  };
}

export function createMoveEntry(move: Move, fen: string): MoveEntry {
  return {
    san: move.san,
    fen,
    color: move.color as "w" | "b",
    from: move.from,
    to: move.to,
    uci: getMoveUci(move),
    captured: move.captured as CapturedPiece | undefined,
  };
}

export function getGameResult(game: Chess) {
  if (game.isCheckmate()) {
    return game.turn() === "w" ? "0-1" : "1-0";
  }

  if (game.isDraw()) {
    return "1/2-1/2";
  }

  return "*";
}

export function getGameTermination(game: Chess): string {
  if (game.isCheckmate()) {
    return "Checkmate";
  }

  if (game.isStalemate()) {
    return "Stalemate";
  }

  if (game.isThreefoldRepetition()) {
    return "Threefold repetition";
  }

  if (game.isDrawByFiftyMoves()) {
    return "Fifty-move rule";
  }

  if (game.isInsufficientMaterial()) {
    return "Insufficient material";
  }

  if (game.isDraw()) {
    return "Draw";
  }

  return "Unterminated";
}

export function createPlayGamePgn({
  game,
  date,
  freePlay,
  playerColor,
  playerName,
  botElo,
  openingName,
  selfOpponentLabel,
}: CreatePlayGamePgnParams): string {
  const result = getGameResult(game);
  const termination = getGameTermination(game);
  const pgnGame = new Chess();
  const rawPgn = game.pgn();

  if (rawPgn.trim()) {
    pgnGame.loadPgn(rawPgn);
  }

  const stockfish = `Stockfish ${botElo}`;
  const white = freePlay || playerColor === "w" ? playerName : stockfish;
  const black = freePlay
    ? selfOpponentLabel
    : playerColor === "w"
      ? stockfish
      : playerName;

  pgnGame.setHeader("Event", freePlay ? "GLFish Free Play" : "GLFish Game");
  pgnGame.setHeader("Site", "GLFish");
  pgnGame.setHeader("Date", formatPgnDate(date));
  pgnGame.setHeader("Round", "-");
  pgnGame.setHeader("White", white);
  pgnGame.setHeader("Black", black);
  pgnGame.setHeader("Result", result);
  pgnGame.setHeader("Termination", termination);
  pgnGame.setHeader("Annotator", "GLFish");

  if (!freePlay) {
    const eloHeader = playerColor === "w" ? "BlackElo" : "WhiteElo";
    pgnGame.setHeader(eloHeader, String(botElo));
  }

  if (openingName) {
    pgnGame.setHeader("Opening", openingName);
  }

  return pgnGame.pgn();
}

export function createEditableGame(fen: string): Chess {
  return new Chess(fen, {
    skipValidation: true,
  });
}

export function placeEditedPiece(
  game: Chess,
  square: Square,
  editPiece: EditPiece,
): Chess | null {
  const editedGame = createEditableGame(game.fen());

  editedGame.remove(square);

  if (editPiece && editPiece !== "remove") {
    const wasPlaced = editedGame.put(editPiece, square);

    if (!wasPlaced) {
      return null;
    }
  }

  return editedGame;
}

export function moveEditedPieceInGame(
  game: Chess,
  from: Square,
  to: Square,
): Chess | null {
  const editedGame = createEditableGame(game.fen());
  const piece = editedGame.get(from);

  if (!piece) {
    return null;
  }

  editedGame.remove(from);
  editedGame.remove(to);
  editedGame.put(piece, to);

  return editedGame;
}

export function createClearedEditedGame(turn: Color): Chess {
  const editedGame = new Chess();

  editedGame.clear();
  editedGame.setTurn(turn);

  return editedGame;
}

export function createEditedGameWithTurn(game: Chess, color: Color): Chess {
  const fenParts = game.fen().split(" ");
  fenParts[1] = color;
  fenParts[3] = "-";
  fenParts[4] = "0";
  fenParts[5] = "1";

  return createEditableGame(fenParts.join(" "));
}
