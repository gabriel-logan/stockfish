import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createSavedGame,
  deleteSavedGame,
  renameSavedGame,
} from "../services/savedGameService";
import type { CreateSavedGameRequest, SavedGame } from "../types/api";

interface RenameSavedGameRequest {
  gameId: string;
  name: string;
}

export function useCreateSavedGameMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (game: CreateSavedGameRequest) => {
      return createSavedGame(game);
    },
    onSuccess: (savedGame) => {
      queryClient.setQueriesData<SavedGame[]>(
        { queryKey: ["saved-games"] },
        (games) => {
          if (!games) {
            return games;
          }

          const gamesWithoutDuplicate = games.filter((game) => {
            return game.id !== savedGame.id;
          });

          return [savedGame, ...gamesWithoutDuplicate];
        },
      );

      void queryClient.invalidateQueries({
        queryKey: ["saved-games"],
      });
    },
  });
}

export function useRenameSavedGameMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ gameId, name }: RenameSavedGameRequest) => {
      return renameSavedGame(gameId, name);
    },
    onSuccess: (savedGame) => {
      queryClient.setQueriesData<SavedGame[]>(
        { queryKey: ["saved-games"] },
        (games) => {
          if (!games) {
            return games;
          }

          return games.map((game) => {
            if (game.id === savedGame.id) {
              return savedGame;
            }

            return game;
          });
        },
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["saved-games"],
      });
    },
  });
}

export function useDeleteSavedGameMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (gameId: string) => {
      return deleteSavedGame(gameId);
    },
    onSuccess: (_data, gameId) => {
      queryClient.setQueriesData<SavedGame[]>(
        { queryKey: ["saved-games"] },
        (games) => {
          if (!games) {
            return games;
          }

          return games.filter((game) => {
            return game.id !== gameId;
          });
        },
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["saved-games"],
      });
    },
  });
}
