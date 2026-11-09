// 관리자 세션 훅 파일, 처음 열 때 /auth/me로 확인 → 로그인 됨·안 됨·권한 없음·꺼짐 상태 하나로
// AdminApp이 씀, 쓰는 중 401·403이 오면 adminClient 알림으로 상태가 바로 바뀜
import { useCallback, useEffect, useState } from 'react'
import { setAuthLostHandlers, setCsrfToken } from '@/admin/shared/api/adminClient'
import { fetchMe, loginRequest, logoutRequest } from '@/admin/domains/auth/api/auth.api'

// state: 'loading' | 'in' | 'out' | 'noAccess' | 'off' | 'unavailable' | 'error'
const LOADING = { state: 'loading', admin: null }

// 실패 → 상태 (401 로그인 필요, 403 메일 확인 안 됨, 404 관리자 페이지 꺼짐, 503 권한 확인 서버 못 닿음)
const stateOfFailure = (error) => {
  if (error.status === 401) return { state: 'out', admin: null, lostCode: error.code }
  if (error.status === 403 && error.code === 'ADMIN_ACCESS_REQUIRED') return { state: 'noAccess', admin: null }
  if (error.status === 404) return { state: 'off', admin: null }
  if (error.status === 503 && error.code === 'ADMIN_ACCESS_UNAVAILABLE') return { state: 'unavailable', admin: null }
  return { state: 'error', admin: null, error }
}

const stateOfMe = (me) => {
  setCsrfToken(me.csrfToken)
  return { state: 'in', admin: me.admin, idleExpiresAt: me.idleExpiresAt }
}

// /auth/me 물어 다음 상태를 돌려줌 (던지지 않음)
const checkSession = () => fetchMe().then(stateOfMe, (error) => {
  setCsrfToken(null)
  return stateOfFailure(error)
})

export function useAdminSession() {
  const [session, setSession] = useState(LOADING)

  // 쓰는 중 세션 끝남(401) → 로그인 화면 + 끝난 까닭(lostCode), 메일 확인 풀림(403) → 권한 없음 화면
  useEffect(() => {
    let alive = true
    const stop = setAuthLostHandlers({
      loginLost: (code) => {
        setCsrfToken(null)
        setSession({ state: 'out', admin: null, lostCode: code })
      },
      accessLost: () => setSession({ state: 'noAccess', admin: null }),
    })
    checkSession().then((next) => {
      if (alive) setSession(next)
    })
    return () => {
      alive = false
      stop()
    }
  }, [])

  // 실패는 LoginPage가 받아 문구로 보여 줌 (던짐)
  const login = useCallback(async (input) => {
    setSession(stateOfMe(await loginRequest(input)))
  }, [])

  // 로그아웃 실패해도 화면은 로그인으로, 단 401이면 알림이 이미 끝난 까닭까지 담아 바꿔 둠
  const logout = useCallback(async () => {
    try {
      await logoutRequest()
    } catch (error) {
      if (error.status === 401) return
    }
    setCsrfToken(null)
    setSession({ state: 'out', admin: null })
  }, [])

  const retry = useCallback(() => {
    setSession(LOADING)
    checkSession().then(setSession)
  }, [])

  return { ...session, login, logout, retry }
}
