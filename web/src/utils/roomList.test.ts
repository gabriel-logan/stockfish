import { describe, expect, it } from "vitest";

import type { Room } from "../types/api";
import { updateRoomList } from "./roomList";

const openRoom: Room = {
  id: "room-1",
  ownerId: "user-1",
  status: "waiting",
  visibility: "public",
  rated: false,
  timeControlSeconds: 600,
  incrementSeconds: 0,
  whiteUserId: "user-1",
  blackUserId: null,
  createdAt: "2026-07-24T15:00:00.000Z",
  updatedAt: "2026-07-24T15:00:00.000Z",
};

describe("room list", () => {
  it("removes a room after it is filled", () => {
    const playingRoom = {
      ...openRoom,
      status: "playing",
      blackUserId: "user-2",
    };

    expect(updateRoomList([openRoom], playingRoom)).toEqual([]);
  });

  it("keeps only open rooms when applying an update", () => {
    const closedRoom = { ...openRoom, id: "room-2", status: "cancelled" };

    expect(updateRoomList([openRoom, closedRoom], openRoom)).toEqual([
      openRoom,
    ]);
  });
});
