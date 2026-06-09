import { Navigate, Outlet } from "react-router-dom"
import {
  selectIsAuthenticated,
  useAuthStore,
} from "@/domains/auth/store/authStore"

export default function ProtectedRoute() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated)

  if (!isAuthenticated) {
    alert("로그인이 필요한 페이지입니다!")
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
