import { Navigate, Outlet, useLocation } from "react-router";

import { useAuthStore } from "../store/authStore";

export function PrivateRoutes() {
  const location = useLocation();
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function PublicRoutes() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (accessToken) {
    return <Navigate to="/online" replace />;
  }

  return <Outlet />;
}
