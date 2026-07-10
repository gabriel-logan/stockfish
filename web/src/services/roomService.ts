import apiInstance from "../lib/apiInstance";
import type {
  JoinMatchmakingResponse,
  JoinRoomResponse,
  Room,
} from "../types/api";

export async function listRooms(): Promise<Room[]> {
  const response = await apiInstance.get<Room[]>("/rooms");

  return response.data;
}

export async function joinMatchmaking(): Promise<JoinMatchmakingResponse> {
  const response = await apiInstance.post<JoinMatchmakingResponse>(
    "/matchmaking/join",
    {
      rated: false,
      timeControlSeconds: 600,
      incrementSeconds: 0,
    },
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
