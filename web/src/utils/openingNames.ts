import { resources } from "../constants";
import { openings } from "../data/openings";

type OpeningKey = keyof typeof resources.en.translation.openings;

export function getOpeningName(fen: string): string | null {
  const placement = fen.split(" ")[0];
  const match = openings.find((o) => o.fen === placement);

  return match?.name ?? null;
}

export function getLatestOpeningName(fens: readonly string[]): string | null {
  for (let i = fens.length - 1; i >= 0; i--) {
    const name = getOpeningName(fens[i]);

    if (name) {
      return name;
    }
  }

  return null;
}

export function getOpeningKey(name: string): OpeningKey {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") as OpeningKey;
}
