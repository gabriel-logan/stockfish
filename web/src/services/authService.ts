import apiInstance from "../lib/apiInstance";
import type { AuthResponse } from "../types/api";

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
