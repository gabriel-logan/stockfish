import { useQuery } from "@tanstack/react-query";

import { listRooms } from "../services/roomService";

export function useRoomsQuery(enabled = true) {
  return useQuery({
    queryKey: ["rooms"],
    queryFn: listRooms,
    enabled,
  });
}
