/**
 * 앱 최상위 컴포넌트.
 *
 * localStorage에 남아 있는 로그인 상태를 서버 쿠키로 재검증하고,
 * 인증 상태에 따라 전역 Socket.io 연결을 관리한 뒤 라우터를 렌더합니다.
 */
import { useEffect } from "react"
import { RouterProvider } from "react-router-dom"
import { router } from "@/app/routes/index"
import { useAuthStore } from "@/domains/auth/store/authStore"
import { getMeApi } from "@/domains/auth/api/auth"
import { useSocket } from "@/shared/hooks/useSocket"

// sessionStorage는 리로드 시 유지, 탭/브라우저 종료 시 초기화 → 리로드 여부 판별에 사용
const RELOAD_FLAG = 'app:was_reload'

export default function App() {
  useEffect(() => {
    const { isLoggedIn } = useAuthStore.getState()

    const wasReload = sessionStorage.getItem(RELOAD_FLAG) === '1'
    sessionStorage.removeItem(RELOAD_FLAG)

    if (isLoggedIn && !wasReload) {
      // 새 탭/재시작 시에만 검증 — 세션 쿠키가 없으면 localStorage의 isLoggedIn을 초기화
      getMeApi().catch(() => {
        useAuthStore.getState().logout()
      })
    }

    const handleBeforeUnload = () => {
      sessionStorage.setItem(RELOAD_FLAG, '1')
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // 로그인 상태에 맞춰 실시간 소켓 연결을 관리 (다중 접속 제어 / 친구 상태 동기화)
  useSocket()

  return <RouterProvider router={router} />
}
