import type { Room } from "../types/api";

function isOpenRoom(room: Room) {
  return room.status === "waiting" && room.blackUserId === null;
}

export function updateRoomList(rooms: Room[] | undefined, room: Room) {
  const filteredRooms = (rooms ?? []).filter((currentRoom) => {
    return currentRoom.id !== room.id && isOpenRoom(currentRoom);
  });

  if (!isOpenRoom(room)) {
    return filteredRooms;
  }

  return [room, ...filteredRooms];
}
