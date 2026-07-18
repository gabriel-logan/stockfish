import { useQuery } from "@tanstack/react-query";

import {
  fetchChessComGames,
  fetchLichessGames,
} from "../services/externalGameService";

export type { ExternalGame } from "../services/externalGameService";

export type ExternalGamesSource = "chesscom" | "lichess";

export interface ExternalGamesRequest {
  source: ExternalGamesSource;
  username: string;
}

export function useExternalGamesQuery(request: ExternalGamesRequest | null) {
  return useQuery({
    queryKey: request
      ? ["external-games", request.source, request.username]
      : ["external-games", "idle", ""],
    queryFn: () => {
      if (!request) {
        return Promise.resolve([]);
      }

      if (request.source === "chesscom") {
        return fetchChessComGames(request.username);
      }

      return fetchLichessGames(request.username);
    },
    enabled: request !== null,
    retry: false,
  });
}
