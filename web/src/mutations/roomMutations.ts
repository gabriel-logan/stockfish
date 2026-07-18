import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  joinMatchmaking,
  joinRoom,
  leaveMatchmaking,
} from "../services/roomService";
import type { Room } from "../types/api";

function updateRoomList(rooms: Room[] | undefined, room: Room) {
  if (!rooms) {
    return [room];
  }

  const filteredRooms = rooms.filter((currentRoom) => {
    return currentRoom.id !== room.id;
  });

  return [room, ...filteredRooms];
}

export function useJoinMatchmakingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: joinMatchmaking,
    onSuccess: (response) => {
      queryClient.setQueryData<Room[]>(["rooms"], (rooms) => {
        return updateRoomList(rooms, response.room);
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}

export function useJoinRoomMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roomId: string) => {
      return joinRoom(roomId);
    },
    onSuccess: (response) => {
      queryClient.setQueryData<Room[]>(["rooms"], (rooms) => {
        return updateRoomList(rooms, response.room);
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}

export function useLeaveMatchmakingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: leaveMatchmaking,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}
