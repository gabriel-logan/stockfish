import type { Chess, Move } from "chess.js";

function playSound(fileName: string): void {
  const audio = new Audio(`${import.meta.env.BASE_URL}sounds/${fileName}`);

  void audio.play().catch(() => {
    // Browsers can block audio until the user interacts with the page.
  });
}

export function playMoveSound(): void {
  playSound("move.mp3");
}

export function playClickSound(): void {
  playSound("click.mp3");
}

export function playIllegalMoveSound(): void {
  playSound("illegal.mp3");
}

export function playNotificationSound(): void {
  playSound("notify.mp3");
}

export function playErrorSound(): void {
  playSound("error.mp3");
}

export function playMoveResultSound(move: Move, game: Chess): void {
  if (game.isGameOver()) {
    playNotificationSound();

    return;
  }

  if (game.isCheck()) {
    playSound("move-check.mp3");

    return;
  }

  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    playSound("castle.mp3");

    return;
  }

  if (move.captured) {
    playSound("capture.mp3");

    return;
  }

  playMoveSound();
}

export function playMoveRecordSound(san: string, gameOver: boolean): void {
  if (gameOver) {
    playNotificationSound();

    return;
  }

  if (san.includes("+")) {
    playSound("move-check.mp3");

    return;
  }

  if (san.startsWith("O-O")) {
    playSound("castle.mp3");

    return;
  }

  if (san.includes("x")) {
    playSound("capture.mp3");

    return;
  }

  playMoveSound();
}
