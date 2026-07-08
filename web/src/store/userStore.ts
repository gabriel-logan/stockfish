import { create } from "zustand";
import { persist } from "zustand/middleware";

import { STORAGE_KEY_USER_STORE } from "../constants";
import { createId } from "../utils/createId";

export interface SavedGame {
  id: string;
  pgn: string;
  date: string;
  result: string;
  opponent: string;
  opening?: string;
  playerColor: "w" | "b";
  botElo?: number;
  moves: number;
}

export interface User {
  id: string;
  name: string;
  createdAt: string;
  games: SavedGame[];
}

interface UserState {
  users: User[];
  activeUserId: string | null;
  createUser: (name: string) => string;
  deleteUser: (id: string) => void;
  setActiveUser: (id: string) => void;
  saveGame: (game: SavedGame) => void;
  deleteGame: (gameId: string) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      users: [],
      activeUserId: null,

      createUser: (name: string) => {
        const id = createId();
        const newUser: User = {
          id,
          name,
          createdAt: new Date().toISOString(),
          games: [],
        };

        set((state) => ({
          users: [...state.users, newUser],
          activeUserId: state.activeUserId ?? id,
        }));

        return id;
      },

      deleteUser: (id: string) => {
        set((state) => {
          const remaining = state.users.filter((u) => u.id !== id);

          return {
            users: remaining,
            activeUserId:
              state.activeUserId === id
                ? (remaining[0]?.id ?? null)
                : state.activeUserId,
          };
        });
      },

      setActiveUser: (id: string) => {
        set({ activeUserId: id });
      },

      saveGame: (game: SavedGame) => {
        set((state) => ({
          users: state.users.map((u) =>
            u.id === state.activeUserId
              ? { ...u, games: [...u.games, game] }
              : u,
          ),
        }));
      },

      deleteGame: (gameId: string) => {
        set((state) => ({
          users: state.users.map((u) =>
            u.id === state.activeUserId
              ? { ...u, games: u.games.filter((g) => g.id !== gameId) }
              : u,
          ),
        }));
      },
    }),
    {
      name: STORAGE_KEY_USER_STORE,
    },
  ),
);
