// Discord 계정 연결 결과 문구 (서버가 주소에 붙여 준 성공 표시·오류 코드 → 안내 문구)
// DiscordAccountLink·시험이 씀 (이름은 훅이지만 훅은 없음), 연결 시작(startDiscordLink)은 모바일도 씀
import { apiClient } from "../../../shared/api/client.js"

// 오류 코드별 문구
export const ERROR_MSGS = {
  OAUTH_CANCELLED: "Discord 계정 연결을 취소했습니다.",
  STATE_MISSING: "연결 요청 정보가 없습니다. 다시 시도해주세요.",
  STATE_INVALID: "연결 요청이 유효하지 않습니다. 다시 시도해주세요.",
  STATE_EXPIRED: "연결 요청이 만료되었습니다. 다시 시도해주세요.",
  STATE_REUSED: "이미 처리된 연결 요청입니다. 다시 시도해주세요.",
  STATE_FINGERPRINT_MISMATCH: "요청 출처가 일치하지 않습니다. 다시 시도해주세요.",
  STATE_USER_MISMATCH: "연결 요청을 시작한 세션과 일치하지 않습니다. 다시 로그인 후 시도해주세요.",
  SESSION_REVOKED: "세션이 만료되었습니다. 다시 로그인 후 시도해주세요.",
  SESSION_EXPIRED: "로그인 유지 시간이 지났습니다. 다시 로그인 후 시도해주세요.",
  IDENTITY_ALREADY_LINKED: "이미 다른 계정에 연결된 Discord 계정입니다.",
  PROVIDER_INVALID: "Discord 계정 정보를 확인할 수 없습니다.",
  DISCORD_OAUTH_NOT_CONFIGURED: "지금은 Discord 계정 연결을 사용할 수 없습니다.",
  DISCORD_CODE_MISSING: "Discord 인증 정보가 없습니다. 다시 시도해주세요.",
  DISCORD_TOKEN_EXCHANGE_FAILED: "Discord 인증에 실패했습니다. 다시 시도해주세요.",
  DISCORD_PROFILE_FETCH_FAILED: "Discord 프로필 조회에 실패했습니다. 다시 시도해주세요.",
  DISCORD_PROFILE_INVALID: "Discord 계정 정보를 확인할 수 없습니다.",
  DISCORD_OAUTH_TIMEOUT: "Discord 응답이 지연되었습니다. 다시 시도해주세요.",
  LINK_SESSION_LOST: "로그인이 만료되었습니다. 다시 로그인 후 연결해 주세요.",
}
// 연결 시작 전 세션 확인이 안 될 때 화면이 주소에 붙이는 코드 (문구는 위 표)
export const SESSION_LOST_CODE = "LINK_SESSION_LOST"
// 모르는 코드일 때 기본 문구
export const DEFAULT_DISCORD_LINK_ERROR_MESSAGE = "Discord 계정 연결에 실패했습니다. 다시 시도해주세요."

// 코드 → 문구, 모르는 코드면 기본 문구
export function mapDiscordLinkErrorCode(code) {
  if (typeof code === "string" && Object.prototype.hasOwnProperty.call(ERROR_MSGS, code)) {
    return ERROR_MSGS[code]
  }
  return DEFAULT_DISCORD_LINK_ERROR_MESSAGE
}

// 성공 표시가 있으면 성공 문구, 아니면 오류 코드 문구, 둘 다 없으면 null
export function resolveDiscordLinkMessage({ socialLinkSuccess, socialLinkError } = {}) {
  if (typeof socialLinkSuccess === "string" && socialLinkSuccess) {
    return { type: "success", text: "Discord 계정이 연결되었습니다." }
  }
  if (typeof socialLinkError === "string" && socialLinkError) {
    return { type: "error", text: mapDiscordLinkErrorCode(socialLinkError) }
  }
  return null
}

// 연결 시작 전 세션 확인: access가 살아 있으면 갱신 안 함, 만료일 때만 apiClient가 갱신 (FE-011)
// 무조건 갱신하면 로그인 유지 안 한 계정은 refresh 쿠키가 없어 401 → 서버가 쿠키를 지워 로그아웃됨
// 401이어도 공통 로그아웃 처리로 안 넘김 (안내만 띄우게)
const checkSession = () =>
  apiClient("/auth/me", { unauthorizedInline: true }).then(() => true).catch(() => false)

// 세션 확인되면 연결 주소로 이동, 안 되면 onSessionLost로 "다시 로그인 후" 안내 (로그아웃·튕김 없음)
export async function startDiscordLink(linkUrl, {
  check = checkSession,
  go = (url) => { window.location.href = url },
  onSessionLost = () => {},
} = {}) {
  const ok = await check()
  if (ok) {
    go(linkUrl)
    return true
  }
  onSessionLost(SESSION_LOST_CODE)
  return false
}
