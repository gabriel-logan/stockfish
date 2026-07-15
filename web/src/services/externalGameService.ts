import {
  formatExternalGameLabel,
  getPgnHeader,
  splitPgnList,
} from "../utils/pgn";

export interface ExternalGame {
  id: string;
  label: string;
  pgn: string;
}

export async function fetchChessComGames(
  username: string,
): Promise<ExternalGame[]> {
  const archivesResponse = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
  );

  if (!archivesResponse.ok) {
    throw new Error("Could not find that Chess.com user.");
  }

  const archivesData = (await archivesResponse.json()) as {
    archives?: string[];
  };
  const archives = archivesData.archives ?? [];

  for (const archiveUrl of archives.slice().reverse()) {
    const gamesResponse = await fetch(archiveUrl);

    if (!gamesResponse.ok) {
      continue;
    }

    const gamesData = (await gamesResponse.json()) as {
      games?: {
        pgn?: string;
        rules?: string;
        end_time?: number;
        white?: { username?: string };
        black?: { username?: string };
      }[];
    };
    const games = (gamesData.games ?? [])
      .filter((game) => {
        return game.rules === "chess" && !!game.pgn;
      })
      .slice()
      .reverse()
      .slice(0, 20);

    if (games.length === 0) {
      continue;
    }

    return games.map((game, index) => {
      const pgn = game.pgn ?? "";
      const date = game.end_time
        ? new Date(game.end_time * 1000).toLocaleDateString()
        : "";
      const white = game.white?.username || getPgnHeader(pgn, "White");
      const black = game.black?.username || getPgnHeader(pgn, "Black");
      const result = getPgnHeader(pgn, "Result") || "*";
      const fallback = date || `Game ${index + 1}`;

      return {
        id: `${game.end_time ?? index}-${index}`,
        label:
          white && black
            ? `${fallback} - ${white} vs ${black} ${result}`
            : formatExternalGameLabel(pgn, fallback),
        pgn,
      };
    });
  }

  return [];
}

export async function fetchLichessGames(
  username: string,
): Promise<ExternalGame[]> {
  const params = new URLSearchParams({
    max: "20",
    clocks: "true",
    evals: "false",
    opening: "true",
  });
  const response = await fetch(
    `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params.toString()}`,
    {
      headers: {
        Accept: "application/x-chess-pgn",
      },
    },
  );

  if (!response.ok) {
    throw new Error("Could not load games for that Lichess user.");
  }

  const pgnText = await response.text();

  return splitPgnList(pgnText).map((pgn, index) => {
    return {
      id: `${getPgnHeader(pgn, "Site") || "lichess"}-${index}`,
      label: formatExternalGameLabel(pgn, `Game ${index + 1}`),
      pgn,
    };
  });
}
