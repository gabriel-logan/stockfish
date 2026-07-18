import apiInstance from "../lib/apiInstance";
import type { CreateSavedGameRequest, SavedGame } from "../types/api";

export async function listSavedGames(): Promise<SavedGame[]> {
  const response = await apiInstance.get<SavedGame[]>("/saved-games");

  return response.data;
}

export async function createSavedGame(
  game: CreateSavedGameRequest,
): Promise<SavedGame> {
  const response = await apiInstance.post<SavedGame>("/saved-games", game);

  return response.data;
}

export async function renameSavedGame(
  gameId: string,
  name: string,
): Promise<SavedGame> {
  const response = await apiInstance.patch<SavedGame>(
    `/saved-games/${gameId}`,
    {
      name,
    },
  );

  return response.data;
}

export async function deleteSavedGame(gameId: string): Promise<void> {
  await apiInstance.delete(`/saved-games/${gameId}`);
}
