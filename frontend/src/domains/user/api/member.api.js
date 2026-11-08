// 회원 관리 HTTP 요청 (내 계정 정보·회원 탈퇴·이메일 바꾸기)
// 탈퇴·이메일 바꾸기 폼 훅이 씀, 데스크톱·모바일 같이
import { api } from "../../../shared/api/client.js"

// 내 계정 이메일·비번 있는 계정인지 → { email, hasLocalPassword }
export const getMyAccountApi = async () => {
  return await api.get("/user/me/account")
}

// 회원 탈퇴 (비번 있는 계정은 password, 소셜 전용은 confirmEmail)
export const withdrawApi = async ({ password, confirmEmail }) => {
  return await api.post("/user/me/withdraw", { password, confirmEmail })
}

// 새 이메일로 인증번호 보내기 (비번 있는 계정은 현재 비번 같이) → { expiresInSec, resendAfterSec }
export const requestEmailChangeApi = async ({ newEmail, currentPassword }) => {
  return await api.post("/user/me/email/code", { newEmail, currentPassword })
}

// 인증번호 확인 → { email }
export const confirmEmailChangeApi = async ({ newEmail, code }) => {
  return await api.post("/user/me/email/verify", { newEmail, code })
}
