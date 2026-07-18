import { useMutation, useQueryClient } from "@tanstack/react-query";

import { resignGame } from "../services/gameService";
import type { GameResponse } from "../types/api";

export function useResignGameMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (gameId: string) => {
      return resignGame(gameId);
    },
    onSuccess: (game) => {
      queryClient.setQueryData<GameResponse>(["games", game.id], (response) => {
        if (!response) {
          return response;
        }

        return {
          ...response,
          game,
        };
      });

      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}
