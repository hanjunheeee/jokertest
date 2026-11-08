// 약관 API 요청 (지금 약관 목록·내 재동의 필요 목록·재동의)
// 가입 약관 훅(useSignupTerms)·재동의 훅(useTermsReconsent)이 씀, 데스크톱·모바일 같이
import { api } from "../../../shared/api/client.js"

// 지금 약관 목록 (로그인 전에도 됨) → { terms: [...] }
export const getCurrentTermsApi = async () => {
  return await api.get("/auth/terms")
}

// 내 재동의 필요 목록 → { pending: [...], reconsentRequired }
export const getMyPendingTermsApi = async () => {
  return await api.get("/user/me/terms")
}

// 재동의 (지금 버전 id 목록) → 남은 필요 목록
export const agreeTermsApi = async (agreedTermsVersionIds) => {
  return await api.post("/user/me/terms/agree", { agreedTermsVersionIds })
}
