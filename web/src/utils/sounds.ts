function playSound(fileName: string): void {
  const audio = new Audio(`${import.meta.env.BASE_URL}sounds/${fileName}`);

  void audio.play().catch(() => {
    // Browsers can block audio until the user interacts with the page.
  });
}

export function playMoveSound(): void {
  playSound("move.mp3");
}

export function playCaptureSound(): void {
  playSound("capture.mp3");
}

export function playGameOverSound(): void {
  playSound("error.mp3");
}
