import axios from "axios";

import { baseUrlApi } from "../constants";
import { useAuthStore } from "../store/authStore";
import type { AuthResponse } from "../types/api";
import { queryClient } from "./queryClient";

const apiInstance = axios.create({
  baseURL: baseUrlApi,
});

apiInstance.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

apiInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const status = axios.isAxiosError(error) ? error.response?.status : null;
    const originalRequest = axios.isAxiosError(error) ? error.config : null;
    const refreshToken = useAuthStore.getState().refreshToken;

    if (
      status !== 401 ||
      !originalRequest ||
      !refreshToken ||
      originalRequest.url === "/auth/refresh"
    ) {
      return Promise.reject(error);
    }

    const refreshQueryKey = ["auth-refresh", refreshToken];

    try {
      const refreshedSession = await queryClient.fetchQuery({
        queryKey: refreshQueryKey,
        queryFn: async () => {
          const response = await axios.post<AuthResponse>(
            `${baseUrlApi}/auth/refresh`,
            { refreshToken },
          );

          return response.data;
        },
        retry: false,
        staleTime: 0,
        gcTime: 0,
      });

      useAuthStore
        .getState()
        .setSession(
          refreshedSession.user,
          refreshedSession.accessToken,
          refreshedSession.refreshToken,
        );

      originalRequest.headers.Authorization = `Bearer ${refreshedSession.accessToken}`;

      return apiInstance(originalRequest);
    } catch (refreshError) {
      useAuthStore.getState().clearSession();
      queryClient.removeQueries();

      return Promise.reject(refreshError);
    } finally {
      queryClient.removeQueries({ queryKey: refreshQueryKey, exact: true });
    }
  },
);

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error ?? error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error";
}

export default apiInstance;
