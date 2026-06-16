import { useEffect } from "react"
import { RouterProvider } from "react-router-dom"
import { router } from "@/app/routes/index"
import { useAuthStore } from "@/domains/auth/store/authStore"
import { getMeApi } from "@/domains/auth/api/auth"
import { useSocket } from "@/shared/hooks/useSocket"

export default function App() {
  useEffect(() => {
    if (!useAuthStore.getState().isLoggedIn) return;
    getMeApi().catch(() => {});
  }, []);

  // 로그인 상태에 맞춰 실시간 소켓 연결을 관리 (다중 접속 제어 / 친구 상태 동기화)
  useSocket();

  return <RouterProvider router={router} />;
}
