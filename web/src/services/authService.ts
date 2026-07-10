import apiInstance from "../lib/apiInstance";
import type { ApiUser, AuthResponse } from "../types/api";

export async function registerUser(
  username: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  const response = await apiInstance.post<AuthResponse>("/auth/register", {
    username,
    email,
    password,
  });

  return response.data;
}

export async function loginUser(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const response = await apiInstance.post<AuthResponse>("/auth/login", {
    email,
    password,
  });

  return response.data;
}

export async function logoutUser(refreshToken: string): Promise<void> {
  await apiInstance.post("/auth/logout", { refreshToken });
}

export async function getMe(): Promise<ApiUser> {
  const response = await apiInstance.get<ApiUser>("/me");

  return response.data;
}
