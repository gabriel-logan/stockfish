let audioContext: AudioContext | null = null;

function getContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  return audioContext;
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
  volume: number = 0.1,
): void {
  const ctx = getContext();

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;

  gain.gain.value = volume;
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start();
  oscillator.stop(ctx.currentTime + duration);
}

export function playMoveSound(): void {
  playTone(600, 0.08, "sine", 0.08);
}

export function playCaptureSound(): void {
  playTone(300, 0.12, "triangle", 0.12);
}

export function playGameOverSound(): void {
  playTone(440, 0.3, "sawtooth", 0.08);
}
