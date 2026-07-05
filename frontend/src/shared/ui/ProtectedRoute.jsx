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
  // authStore(전역 상태)에서 로그인 여부만 골라서 구독
  const isAuthenticated = useAuthStore(selectIsAuthenticated)

  // useEffect(콜백, 의존성배열)는 "렌더링이 끝난 후" 콜백을 실행하는 훅입니다.
  // 화면을 그리는 동안(렌더 단계)에는 alert 같은 부수효과를 넣으면 안 되므로,
  // 렌더가 끝난 뒤 실행되는 이 훅 안에서 alert를 호출합니다.
  // 의존성 배열이 [isAuthenticated]이므로, 처음 마운트될 때와 이후 isAuthenticated
  // 값이 바뀔 때마다(로그인/로그아웃 시) 다시 실행됩니다.
  useEffect(() => {
    if (!isAuthenticated) alert("로그인이 필요한 페이지입니다!")
  }, [isAuthenticated])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
