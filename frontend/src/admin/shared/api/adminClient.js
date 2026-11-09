// 관리자 서버 부르기 공통 파일, 같은 출처 /admin-api + 쿠키 + 쓰기 확인 머리글 + 오류 모양 하나
// 관리자 영역 api 파일(domains/<영역>/api)과 useAdminSession이 씀
const BASE = '/admin-api'

// 이 401이면 세션이 없거나 끝남 → 로그인 화면으로 (로그인 틀림 401은 아님)
const LOGIN_LOST_CODES = new Set(['ADMIN_LOGIN_REQUIRED', 'ADMIN_SESSION_EXPIRED'])
const NETWORK_MESSAGE = '서버에 닿지 않아요. 인터넷 연결을 확인하고 다시 해 주세요.'

// 실패는 늘 이 모양으로 던짐 → 화면은 code로 문구 고름
export class AdminApiError extends Error {
  constructor({ status, code, message, details = {} }) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

// 로그인·/auth/me 응답에서 받은 쓰기 확인 값 (메모리에만, 새로 고침하면 /auth/me로 다시 받음)
let csrfToken = null
// 로그인 풀림·권한 없음 알림 받을 곳 (useAdminSession이 걸어 둠)
let handlers = {}

export const setCsrfToken = (token) => {
  csrfToken = token || null
}

// 걸고 나면 푸는 함수를 돌려줌 (화면이 사라질 때 풂)
export const setAuthLostHandlers = (next) => {
  handlers = next
  return () => {
    if (handlers === next) handlers = {}
  }
}

const buildHeaders = (method, { background, hasBody }) => {
  const headers = { Accept: 'application/json' }
  if (hasBody) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && csrfToken) headers['X-Admin-Csrf'] = csrfToken
  // 자동 새로고침은 활동으로 안 셈 → 가만히 있으면 30분 뒤 로그아웃 그대로
  if (background) headers['X-Admin-Background'] = '1'
  return headers
}

// nginx 오류 화면처럼 json이 아닌 응답이면 null
const readJson = async (response) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

// { ok:false, code, message, ...덧붙인 칸 } → AdminApiError (덧붙인 칸은 details로)
// 예: 429 { ok:false, code:'ADMIN_LOGIN_LOCKED', message:'…', retryAfterSec:600 } → details { retryAfterSec:600 }
const toError = (status, payload) => {
  const { ok: _ok, code, message, ...details } = payload ?? {}
  return new AdminApiError({
    status,
    code: typeof code === 'string' ? code : `HTTP_${status}`,
    message: typeof message === 'string' ? message : '',
    details,
  })
}

const tellAuthLost = (error) => {
  if (error.status === 401 && LOGIN_LOST_CODES.has(error.code)) handlers.loginLost?.(error.code)
  if (error.status === 403 && error.code === 'ADMIN_ACCESS_REQUIRED') handlers.accessLost?.(error.code)
}

const request = async (method, path, { body, background = false } = {}) => {
  const hasBody = body !== undefined
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: buildHeaders(method, { background, hasBody }),
      credentials: 'same-origin',
      cache: 'no-store',
      body: hasBody ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new AdminApiError({ status: 0, code: 'NETWORK_ERROR', message: NETWORK_MESSAGE })
  }
  const payload = await readJson(response)
  if (response.ok && payload && payload.ok !== false) {
    const { ok: _ok, ...content } = payload
    return content
  }
  const error = toError(response.status, payload)
  tellAuthLost(error)
  throw error
}

// 성공이면 ok 뺀 내용, 실패면 AdminApiError 던짐
export const adminApi = {
  get: (path, { background = false } = {}) => request('GET', path, { background }),
  send: (method, path, body) => request(method, path, { body }),
}
