export const ERROR_MSGS = {
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
  if (typeof code === "string" && Object.prototype.hasOwnProperty.call(ERROR_MSGS, code)) {
    return ERROR_MSGS[code]
  }
  return DEFAULT_DISCORD_LINK_ERROR_MESSAGE
}

export function resolveDiscordLinkMessage({ socialLinkSuccess, socialLinkError } = {}) {
  if (typeof socialLinkSuccess === "string" && socialLinkSuccess) {
    return { type: "success", text: "Discord 계정이 연결되었습니다." }
  }
  if (typeof socialLinkError === "string" && socialLinkError) {
    return { type: "error", text: mapDiscordLinkErrorCode(socialLinkError) }
  }
  return null
}
