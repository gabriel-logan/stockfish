import apiInstance from "../lib/apiInstance";
import type {
  JoinMatchmakingResponse,
  JoinRoomResponse,
  MatchmakingOptions,
  Room,
} from "../types/api";

export async function listRooms(): Promise<Room[]> {
  const response = await apiInstance.get<Room[]>("/rooms");

  return response.data;
}

export async function joinMatchmaking(
  options: MatchmakingOptions,
): Promise<JoinMatchmakingResponse> {
  const response = await apiInstance.post<JoinMatchmakingResponse>(
    "/matchmaking/join",
    options,
  );

  return response.data;
}

export async function joinRoom(roomId: string): Promise<JoinRoomResponse> {
  const response = await apiInstance.post<JoinRoomResponse>(
    `/rooms/${roomId}/join`,
  );

  return response.data;
}

export async function leaveMatchmaking(): Promise<void> {
  await apiInstance.post("/matchmaking/leave");
}
