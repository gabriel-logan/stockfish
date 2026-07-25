import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  joinMatchmaking,
  joinRoom,
  leaveMatchmaking,
} from "../services/roomService";
import type { Room } from "../types/api";
import { updateRoomList } from "../utils/roomList";

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
