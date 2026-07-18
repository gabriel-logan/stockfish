import { useQuery } from "@tanstack/react-query";

import { listSavedGames } from "../services/savedGameService";

export function useSavedGamesQuery(userId: string | null) {
  return useQuery({
    queryKey: ["saved-games", userId],
    queryFn: listSavedGames,
    enabled: Boolean(userId),
  });
}
