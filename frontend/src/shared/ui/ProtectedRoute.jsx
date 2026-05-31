import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/domains/auth/store/authStore"; // Zustand 스토어 경로

export default function ProtectedRoute() {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);

  if (!isLoggedIn) {
    alert("로그인이 필요한 페이지입니다!");
    return <Navigate to="/login" replace />; // 👈 로그인 페이지로 쫓아내기
  }

  return <Outlet />; // 👈 로그인이 되어있다면, 요청한 페이지(children)를 보여줌!
}