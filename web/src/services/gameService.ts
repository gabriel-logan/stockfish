import apiInstance from "../lib/apiInstance";
import type { Game, GameResponse } from "../types/api";

export async function getGame(gameId: string): Promise<GameResponse> {
  const response = await apiInstance.get<GameResponse>(`/games/${gameId}`);

  return response.data;
}

export async function resignGame(gameId: string): Promise<Game> {
  const response = await apiInstance.post<Game>(`/games/${gameId}/resign`);

  return response.data;
}
