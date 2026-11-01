// 가입 이메일 인증 시작 상태·안내 문구·에러 code별 HTTP 상태
// 인증 훅(useSignupEmailVerification.js·emailVerification 폴더)과 utils의 errors.js가 사용

// 인증 시작 상태 (켜짐·시도 키·주소가 바뀌거나 reset 때 여기로 되돌림)
export const INITIAL_VERIFICATION = {
  stage: "unverified",
  email: "",
  code: "",
  signupProof: null,
  resendAvailableAt: null,
  codeExpiresAt: null,
  attemptsRemaining: null,
  message: "",
}

// 인증 안내 문구
export const VERIFY_TEXT = {
  retry: "서버와 통신할 수 없습니다. 다시 시도해주세요.",
  expired: "인증번호가 만료되었습니다. 다시 받아주세요.",
  rateLimited: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  badInput: "입력을 확인해주세요.",
  locked: "오입력 횟수를 초과했습니다. 다시 받아주세요.",
  wrongCode: "인증번호가 올바르지 않습니다.",
}

// 서버 에러 code마다 같이 와야 하는 HTTP 상태 (둘 다 맞아야 그 에러로 봄)
export const CODE_ERROR_STATUS = {
  RESEND_TOO_SOON: 429,
  RATE_LIMITED: 429,
  INVALID_INPUT: 400,
  CODE_INVALID: 400,
  CODE_EXPIRED: 400,
  TOO_MANY_ATTEMPTS: 429,
}
