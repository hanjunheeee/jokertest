// 다시 로그인하게 보내기 (화면 로그인 상태 지우고 로그인 화면으로 새로 열기)
// 비번 변경 성공(reloginRequired)·회원 탈퇴 성공이 씀, 시험은 navigate를 넣어 바꿈
import { useAuthStore } from "../../domains/auth/store/auth.store.js"

// 로그아웃 → 로그인 화면 (서버 세션은 이미 끊김)
export function forceRelogin({ navigate } = {}) {
  useAuthStore.getState().logout()
  if (typeof navigate === "function") {
    navigate("/login")
    return
  }
  if (typeof window !== "undefined" && typeof window.location?.replace === "function") {
    window.location.replace("/login")
  }
}
