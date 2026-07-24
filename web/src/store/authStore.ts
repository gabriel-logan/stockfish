import { create } from "zustand";
import { persist } from "zustand/middleware";

import { STORAGE_KEY_AUTH_STORE } from "../constants";
import type { ApiUser } from "../types/api";

interface AuthState {
  user: ApiUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setSession: (
    user: ApiUser,
    accessToken: string,
    refreshToken: string,
  ) => void;
  updateRating: (rating: number) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      setSession: (
        user: ApiUser,
        accessToken: string,
        refreshToken: string,
      ) => {
        set({
          user,
          accessToken,
          refreshToken,
        });
      },

      updateRating: (rating: number) => {
        set((state) => {
          if (!state.user) {
            return state;
          }

          return {
            user: {
              ...state.user,
              rating,
            },
          };
        });
      },

      clearSession: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
        });
      },
    }),
    {
      name: STORAGE_KEY_AUTH_STORE,
    },
  ),
);
