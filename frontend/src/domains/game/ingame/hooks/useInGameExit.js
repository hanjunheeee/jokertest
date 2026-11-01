// 판 나가기 훅: 나가기 확인·보내기·다시 시도·결과 조회 상태, 뒤로 가기 막기
// 인게임 화면·결과 화면이 사용 (보내기·조회 본체는 hooks/exit/)
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useBlocker, useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import {
  getIdentityScopeVersion,
  subscribeIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { createSessionEndFinalizer } from "../utils/sessionEnd.js"
import { createExitConfirmController, isPopNavigationBlocked } from "../utils/exitConfirm.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import { EXIT_STATUS } from "../constants/ingameExit.js"
import { sendLeave as sendLeaveNow } from "./exit/leave.js"
import { lookupExitOutcome } from "./exit/outcome.js"


export function useInGameExit() {
  const navigate = useNavigate()
  const blocker = useBlocker(isPopNavigationBlocked)
  const [exitStatus, setExitStatus] = useState(EXIT_STATUS.IDLE)
  const [exitErrorCode, setExitErrorCode] = useState(null)

  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  const mountedRef = useRef(true)
  const settledRef = useRef(false)
  const timerRef = useRef(null)
  const pendingRef = useRef(false)
  const requestTokenRef = useRef(0)
  const [exitAttemptId, setExitAttemptId] = useState(0)

  // 신원 범위·계정·신원 세대가 바뀌면 진행 중인 나가기를 버림
  const identityScopeVersion = useSyncExternalStore(
    subscribeIdentityScope, getIdentityScopeVersion, getIdentityScopeVersion,
  )
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const scopeKey = `${identityScopeVersion}|${authUuid}|${identityGeneration}`
  const scopeKeyRef = useRef(scopeKey)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = null
      requestTokenRef.current += 1
      pendingRef.current = false
    }
  }, [])

  const setStatus = useCallback((status, code = null) => {
    if (!mountedRef.current) return
    setExitStatus(status)
    setExitErrorCode(code)
  }, [])

  // 시도 번호 올리기 (옛 시도의 응답·시간 초과를 버리는 기준)
  const bumpAttempt = useCallback(() => {
    requestTokenRef.current += 1
    if (mountedRef.current) setExitAttemptId(requestTokenRef.current)
    return requestTokenRef.current
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  // 나가기 끝: 판·방 비우고 화면 옮기기 (한 번만)
  const settle = useCallback(() => {
    if (!mountedRef.current) return
    if (settledRef.current) return
    settledRef.current = true
    pendingRef.current = false
    clearTimer()
    createSessionEndFinalizer({
      clearGame: () => useInGameStore.getState().clearGame(),
      clearRoom: () => useMatchingStore.getState().clearRoom(),
      navigate: (...args) => navigateRef.current(...args),
    })()
  }, [clearTimer])

  useEffect(() => {
    if (scopeKeyRef.current === scopeKey) return
    scopeKeyRef.current = scopeKey
    bumpAttempt()
    clearTimer()
    pendingRef.current = false
    settledRef.current = false
    setStatus(EXIT_STATUS.IDLE)
  }, [scopeKey, bumpAttempt, clearTimer, setStatus])

  // hooks/exit/ 함수들에 넘길 ref·상태 바꾸기 묶음
  const ctx = useMemo(() => ({
    mountedRef, settledRef, pendingRef, timerRef, requestTokenRef,
    bumpAttempt, clearTimer, setStatus, settle,
  }), [bumpAttempt, clearTimer, setStatus, settle])

  const sendLeave = useCallback(() => sendLeaveNow(ctx), [ctx])

  // 확인 창에서 고르면 나가기 보내기 (고른 쪽 효과음)
  const requestExit = useCallback(() => {
    if (pendingRef.current || settledRef.current) return false
    return createExitConfirmController({
      confirm: window.confirm,
      requestLeave: sendLeave,
      onDecision: (kind) => dispatchUiSfx(kind),
    })()
  }, [sendLeave])

  const retryExit = useCallback(() => sendLeave(), [sendLeave])

  const resolveExitOutcome = useCallback(() => lookupExitOutcome(ctx), [ctx])

  // 뒤로 가기가 막히면 나가기 확인을 띄움
  useEffect(() => {
    if (blocker.state !== "blocked") return
    requestExit()
    blocker.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state])

  return {
    requestExit,
    retryExit,
    resolveExitOutcome,
    exitStatus,
    exitErrorCode,
    exitAttemptId,
    isExitPending: exitStatus === EXIT_STATUS.PENDING,
    isExitUnresolved: exitStatus === EXIT_STATUS.UNRESOLVED,
  }
}

export { EXIT_STATUS as IN_GAME_EXIT_STATUS }
