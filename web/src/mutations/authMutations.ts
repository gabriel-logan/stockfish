import { useMutation, useQueryClient } from "@tanstack/react-query";

import { loginUser, logoutUser, registerUser } from "../services/authService";
import { useAuthStore } from "../store/authStore";

interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterCredentials {
  username: string;
  email: string;
  password: string;
}

export function useLoginMutation() {
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation({
    mutationFn: ({ email, password }: LoginCredentials) => {
      return loginUser(email, password);
    },
    onSuccess: (response) => {
      setSession(response.user, response.accessToken, response.refreshToken);
    },
  });
}

export function useRegisterMutation() {
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation({
    mutationFn: ({ username, email, password }: RegisterCredentials) => {
      return registerUser(username, email, password);
    },
    onSuccess: (response) => {
      setSession(response.user, response.accessToken, response.refreshToken);
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  const clearSession = useAuthStore((s) => s.clearSession);

  return useMutation({
    mutationFn: async (refreshToken: string | null) => {
      if (!refreshToken) {
        return;
      }

      await logoutUser(refreshToken);
    },
    onSettled: () => {
      clearSession();
      queryClient.removeQueries();
    },
  });
}
