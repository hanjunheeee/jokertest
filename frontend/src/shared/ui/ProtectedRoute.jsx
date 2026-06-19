/**
 * 인증 필요 라우트 가드 — app/routes에서 lobby·게임 등 하위 라우트 래핑
 * 미인증 시 안내 후 /login으로 replace 리다이렉트
 *
 * 자식 라우트는 <Outlet />으로 렌더
 */
import { useEffect } from "react"
import { Navigate, Outlet } from "react-router-dom"
import {
  selectIsAuthenticated,
  useAuthStore,
} from "@/domains/auth/store/authStore"

/** authStore.isAuthenticated 기준으로 Outlet 또는 로그인 리다이렉트 */
export default function ProtectedRoute() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated)

  // alert는 렌더 단계가 아닌 effect에서 실행해야 React 렌더 순수성을 해치지 않습니다.
  useEffect(() => {
    if (!isAuthenticated) alert("로그인이 필요한 페이지입니다!")
  }, [isAuthenticated])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
