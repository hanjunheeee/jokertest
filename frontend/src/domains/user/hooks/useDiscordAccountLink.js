// F-07 AC-04/D-01: Discord 계정 연결 결과 쿼리(socialLinkSuccess/socialLinkError,
// backend/controller/user.controller.js discordLinkCallback이 /account로 돌려보내며 싣는
// 값)를 화면 메시지로 번역하는 순수 로직입니다. 이 저장소의 node:test 실행에는 JSX 변환기가
// 없어 DiscordAccountLink.jsx를 직접 렌더링해 검증할 수 없으므로(useLoginPage.js의
// mapSocialErrorCode/resolveSocialLoginView와 같은 이유), 그 판정만 여기 순수 함수로 분리해
// 둡니다. 실제 쿼리 파싱(useSearchParams)은 컴포넌트가 합니다.
//
// R-IMPL: 코드 목록은 useLoginPage.js의 SOCIAL_ERROR_MESSAGES와 겹치는 것도 있지만, 여기는
// "연결" 흐름 전용 문구(예: IDENTITY_ALREADY_LINKED, STATE_USER_MISMATCH, SESSION_REVOKED)가
// 있어 그 파일을 그대로 재사용하지 않고 별도로 둡니다 — 로그인 실패와 연결 실패는 사용자가
// 서 있는 화면과 다음 행동이 다릅니다.
export const DISCORD_LINK_ERROR_MESSAGES = {
  OAUTH_CANCELLED: "Discord 계정 연결을 취소했습니다.",
  STATE_MISSING: "연결 요청 정보가 없습니다. 다시 시도해주세요.",
  STATE_INVALID: "연결 요청이 유효하지 않습니다. 다시 시도해주세요.",
  STATE_EXPIRED: "연결 요청이 만료되었습니다. 다시 시도해주세요.",
  STATE_REUSED: "이미 처리된 연결 요청입니다. 다시 시도해주세요.",
  STATE_FINGERPRINT_MISMATCH: "요청 출처가 일치하지 않습니다. 다시 시도해주세요.",
  STATE_USER_MISMATCH: "연결 요청을 시작한 세션과 일치하지 않습니다. 다시 로그인 후 시도해주세요.",
  SESSION_REVOKED: "세션이 만료되었습니다. 다시 로그인 후 시도해주세요.",
  IDENTITY_ALREADY_LINKED: "이미 다른 계정에 연결된 Discord 계정입니다.",
  PROVIDER_INVALID: "Discord 계정 정보를 확인할 수 없습니다.",
  DISCORD_OAUTH_NOT_CONFIGURED: "지금은 Discord 계정 연결을 사용할 수 없습니다.",
  DISCORD_CODE_MISSING: "Discord 인증 정보가 없습니다. 다시 시도해주세요.",
  DISCORD_TOKEN_EXCHANGE_FAILED: "Discord 인증에 실패했습니다. 다시 시도해주세요.",
  DISCORD_PROFILE_FETCH_FAILED: "Discord 프로필 조회에 실패했습니다. 다시 시도해주세요.",
  DISCORD_PROFILE_INVALID: "Discord 계정 정보를 확인할 수 없습니다.",
  DISCORD_OAUTH_TIMEOUT: "Discord 응답이 지연되었습니다. 다시 시도해주세요.",
}
export const DEFAULT_DISCORD_LINK_ERROR_MESSAGE = "Discord 계정 연결에 실패했습니다. 다시 시도해주세요."

export function mapDiscordLinkErrorCode(code) {
  // F-06/F-07 재검토 지적(Chrome 재현: /login?socialError=__proto__ → React #31)과 같은
  // 이유로, 대괄호 표기법 색인이 상속 키(__proto__ 등)를 값으로 내놓지 않도록
  // hasOwnProperty로 이 목록에 실제로 정의한 own key만 신뢰합니다.
  if (typeof code === "string" && Object.prototype.hasOwnProperty.call(DISCORD_LINK_ERROR_MESSAGES, code)) {
    return DISCORD_LINK_ERROR_MESSAGES[code]
  }
  return DEFAULT_DISCORD_LINK_ERROR_MESSAGE
}

// searchParams에서 이미 꺼낸 값만 받아 순수하게 화면에 보여줄 메시지를 판정합니다. 성공/실패
// 둘 다 없으면 null(아직 연결 시도 결과가 없는 평소 화면)입니다.
export function resolveDiscordLinkMessage({ socialLinkSuccess, socialLinkError } = {}) {
  if (typeof socialLinkSuccess === "string" && socialLinkSuccess) {
    return { type: "success", text: "Discord 계정이 연결되었습니다." }
  }
  if (typeof socialLinkError === "string" && socialLinkError) {
    return { type: "error", text: mapDiscordLinkErrorCode(socialLinkError) }
  }
  return null
}
