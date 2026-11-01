// 소셜 로그인 시작 주소로 페이지째 이동 (Google·Discord), 모바일이라 client=mobile을 붙임
// login/SocialButtons.jsx가 씀, 데스크톱은 이 주소를 컴포넌트 안에서 만들어서 모바일 쪽에 따로 둠
import { API_BASE_URL } from "@/shared/env.js"

// 서버가 client=mobile을 시도 표에 실어서 로그인 뒤 모바일 주소로 돌려보냄
function buildStartUrl(provider, rememberMe) {
  const params = new URLSearchParams({ rememberMe: String(rememberMe), client: "mobile" })
  return `${API_BASE_URL}/auth/${provider}?${params.toString()}`
}

// OAuth는 서버가 제공자 화면으로 보내서 fetch 말고 페이지째 이동
export function useSocialLoginStart(rememberMe = false) {
  // Google 로그인 시작
  const startGoogle = () => {
    window.location.href = buildStartUrl("google", rememberMe)
  }

  // Discord 로그인 시작
  const startDiscord = () => {
    window.location.href = buildStartUrl("discord", rememberMe)
  }

  return { startGoogle, startDiscord }
}
