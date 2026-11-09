// 관리자 오류 코드 → 화면 문구 파일, 무엇이 잘못됐고 어떻게 하면 되는지 한 문장
// StatusNote·LoginPage·ConfirmDialog가 씀, 영역 오류는 서버 message(쉬운 우리말)를 그대로 씀
const TEXT = Object.freeze({
  NETWORK_ERROR: '서버에 닿지 않아요. 인터넷 연결을 확인하고 다시 해 주세요.',
  ADMIN_LOGIN_REQUIRED: '로그인이 필요해요.',
  ADMIN_SESSION_EXPIRED: '오래 쓰지 않아 로그아웃됐어요. 다시 로그인해 주세요.',
  ADMIN_ACCESS_REQUIRED: '관리자 메일 확인을 거친 사람만 열 수 있어요.',
  ADMIN_ACCESS_UNAVAILABLE: '권한 확인 서버에 닿지 않아요. 잠시 뒤 다시 해 주세요.',
  ADMIN_CSRF_FAILED: '화면이 오래돼 요청을 막았어요. 새로 고침한 뒤 다시 해 주세요.',
  ADMIN_LOGIN_FAILED: '아이디, 비밀번호, OTP 번호 중 맞지 않는 것이 있어요. 다시 확인해 주세요.',
  ADMIN_EMAIL_MISMATCH: '관리자 메일 확인에 쓴 메일과 이 계정의 메일이 달라요. 본인 계정으로 로그인해 주세요.',
  RATE_LIMITED: '요청이 너무 많아요. 잠시 뒤 다시 해 주세요.',
  ADMIN_BUSY: '다른 조회가 밀려 있어요. 잠시 뒤 다시 해 주세요.',
  ADMIN_QUERY_TIMEOUT: '조회가 오래 걸려 멈췄어요. 잠시 뒤 다시 해 주세요.',
  ADMIN_INTERNAL: '서버에서 문제가 생겼어요. 잠시 뒤 다시 해 주세요.',
  INVALID_INPUT: '입력한 값을 다시 확인해 주세요.',
})

const FALLBACK = '처리하지 못했어요. 잠시 뒤 다시 해 주세요.'

// 남은 초 → 올림한 분 (예: 601초 → 11분, 없으면 15분)
const minutesFrom = (seconds) => Math.max(1, Math.ceil((Number(seconds) || 15 * 60) / 60))

// 오류(또는 코드 글자) → 문구, 예: { code:'ADMIN_LOGIN_LOCKED', details:{ retryAfterSec:601 } } → '… 11분 뒤 다시 해 주세요.'
export const adminErrorText = (errorOrCode) => {
  const error = typeof errorOrCode === 'string' ? { code: errorOrCode } : errorOrCode ?? {}
  if (error.code === 'ADMIN_LOGIN_LOCKED') {
    return `여러 번 틀려서 로그인이 잠겼어요. ${minutesFrom(error.details?.retryAfterSec)}분 뒤 다시 해 주세요.`
  }
  return TEXT[error.code] ?? (error.message || FALLBACK)
}
