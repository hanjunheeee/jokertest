// 소셜 로그인 실패 코드별 문구와 소셜 가입 화면 문구
// socialErrors.js·socialSignup 폴더·SocialSignupForm 화면이 사용, useLoginPage.js는 시험용 다시 내보냄

// 로그인 화면 주소의 socialError 코드 → 안내 문구
export const SOCIAL_ERROR_MESSAGES = {
  OAUTH_CANCELLED: "소셜 로그인을 취소했습니다.",
  STATE_MISSING: "로그인 요청 정보가 없습니다. 다시 시도해주세요.",
  STATE_INVALID: "로그인 요청이 유효하지 않습니다. 다시 시도해주세요.",
  STATE_EXPIRED: "로그인 요청이 만료되었습니다. 다시 시도해주세요.",
  STATE_REUSED: "이미 처리된 로그인 요청입니다. 다시 시도해주세요.",
  STATE_FINGERPRINT_MISMATCH: "요청 출처가 일치하지 않습니다. 다시 시도해주세요.",
  EMAIL_CONFLICT: "이미 가입된 이메일입니다. 기존 계정으로 로그인한 뒤 연결해주세요.",
  EMAIL_MISSING: "소셜 계정에서 이메일 정보를 받지 못했습니다.",
  PROVIDER_INVALID: "소셜 로그인 정보를 확인할 수 없습니다.",
  GOOGLE_OAUTH_NOT_CONFIGURED: "지금은 Google 로그인을 사용할 수 없습니다.",
  GOOGLE_CODE_MISSING: "Google 인증 정보가 없습니다. 다시 시도해주세요.",
  GOOGLE_TOKEN_EXCHANGE_FAILED: "Google 인증에 실패했습니다. 다시 시도해주세요.",
  GOOGLE_PROFILE_FETCH_FAILED: "Google 프로필 조회에 실패했습니다. 다시 시도해주세요.",
  GOOGLE_PROFILE_INVALID: "Google 계정 정보를 확인할 수 없습니다.",
  GOOGLE_OAUTH_TIMEOUT: "Google 응답이 지연되었습니다. 다시 시도해주세요.",
  DISCORD_OAUTH_NOT_CONFIGURED: "지금은 Discord 로그인을 사용할 수 없습니다.",
  DISCORD_CODE_MISSING: "Discord 인증 정보가 없습니다. 다시 시도해주세요.",
  DISCORD_TOKEN_EXCHANGE_FAILED: "Discord 인증에 실패했습니다. 다시 시도해주세요.",
  DISCORD_PROFILE_FETCH_FAILED: "Discord 프로필 조회에 실패했습니다. 다시 시도해주세요.",
  DISCORD_PROFILE_INVALID: "Discord 계정 정보를 확인할 수 없습니다.",
  DISCORD_OAUTH_TIMEOUT: "Discord 응답이 지연되었습니다. 다시 시도해주세요.",
}
// 표에 없는 코드일 때 문구
export const DEFAULT_SOCIAL_ERROR_MESSAGE = "소셜 로그인에 실패했습니다. 다시 시도해주세요."

// 소셜 가입(첫 소셜 로그인) 화면 문구
export const SOCIAL_SIGNUP_TEXT = {
  sessionExpired: "소셜 로그인 세션이 만료되었습니다. 다시 시도해주세요.",
  intentLoadFailed: "가입 정보를 불러오지 못했습니다. 다시 시도해주세요.",
  intentLoading: "가입 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.",
  needEmailVerify: "이메일 인증을 완료해주세요.",
  proofRequired: "이메일 인증이 필요합니다. 다시 인증해주세요.",
  proofInvalid: "이메일 인증이 만료되었거나 이미 사용되었습니다. 다시 인증해주세요.",
  generic: "서버와 통신할 수 없습니다. 다시 시도해주세요.",
  cannotComplete: "가입을 완료할 수 없습니다.",
  needBirthDate: "생년월일을 입력해주세요.",
}
