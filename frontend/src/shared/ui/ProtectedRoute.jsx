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
  selectLoggedOutIntentionally,
  useAuthStore,
} from "@/domains/auth/store/authStore"

/** authStore.isAuthenticated 기준으로 Outlet 또는 로그인 리다이렉트 */
export default function ProtectedRoute() {
  // authStore(전역 상태)에서 로그인 여부만 골라서 구독
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const loggedOutIntentionally = useAuthStore(selectLoggedOutIntentionally)

  // useEffect(콜백, 의존성배열)는 "렌더링이 끝난 후" 콜백을 실행하는 훅입니다.
  // 화면을 그리는 동안(렌더 단계)에는 alert 같은 부수효과를 넣으면 안 되므로,
  // 렌더가 끝난 뒤 실행되는 이 훅 안에서 alert를 호출합니다.
  // 의존성 배열이 [isAuthenticated, loggedOutIntentionally]라서, 로그인/로그아웃으로
  // 둘 중 하나라도 바뀔 때마다 다시 실행됩니다.
  useEffect(() => {
    if(isAuthenticated) return
    // 사용자가 직접 로그아웃해서 인증이 풀린 경우엔 alert 없이 조용히 /login으로 리다이렉트.
    // 주의: loggedOutIntentionally 플래그는 여기서 지우지 않는다 — 지우면 <Navigate>로 인한
    // 실제 라우트 전환(언마운트) 전에 이 컴포넌트가 한 번 더 리렌더→effect 재실행되면서
    // 플래그가 이미 false라 alert가 뒤늦게 뜨는 레이스가 생김. 초기화는 LoginPage의
    // 마운트 effect에서 담당한다.
    if(loggedOutIntentionally) return
    // 여기까지 왔다면 로그아웃이 아니라 "미인증 상태로 페이지에 직접 접근"한 경우
    alert("로그인이 필요한 페이지입니다!")
  }, [isAuthenticated, loggedOutIntentionally])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
