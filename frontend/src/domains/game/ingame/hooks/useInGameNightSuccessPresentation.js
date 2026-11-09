// 밤 성공 연출 훅: 대기열 맨 앞 연출을 고르고, 다 보면 끝맺음 알림
// 인게임 화면·밤 성공 연출 컴포넌트가 사용, 의사 차례 끝·판정 끝 받기는 socket/night.js를 부름
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import {
  getIdentityScopeVersion,
  isSameReceiptScope,
  readInGameReceiptScope,
  readNightSuccessReceiptScope,
  selectNightSuccessQueue,
  subscribeIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { getInGameSocketEpochId } from "../utils/getInGameSocketEpochId.js"
import { onNightActionsResolved, onNightTurnEnded } from "../socket/night.js"

// 의사 차례가 끝나면 그 밤엔 치료가 더 안 옴
const HEAL_WINDOW_CLOSING_ROLE = "DOCTOR"

// 다 보면 최종 생존 결과를 띄울 연출 종류
const FINAL_STATUS_TYPES = new Set(["KILL", "HEAL"])

// 연출 대상 id (대상이 나라고만 오면 내 uuid)
function resolveTargetId(entry, selfUuid) {
  if (typeof entry?.targetId === "string" && entry.targetId.length > 0) return entry.targetId
  if (Array.isArray(entry?.perspectives) && entry.perspectives.includes("TARGET")) {
    return typeof selfUuid === "string" && selfUuid.length > 0 ? selfUuid : null
  }
  return null
}

// 그 밤 결과가 판 상태에 들어갔는지 (다음 날로 넘어갔거나 판 끝)
function isResultReflected(state, nightDayIndex) {
  if (!state || !Number.isInteger(state.dayIndex)) return false
  if (state.phase === "NIGHT") return false
  return state.dayIndex > nightDayIndex || state.phase === "ENDED"
}

// 지금 연출·다 봤다고 알리기·최종 생존 결과와 닫기
export function useInGameNightSuccessPresentation({ hold = false } = {}) {
  const queue = useInGameStore(selectNightSuccessQueue)
  const gameId = useInGameStore((s) => s.gameId)
  const gameState = useInGameStore((s) => s.state)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const identityScopeVersion = useSyncExternalStore(
    subscribeIdentityScope, getIdentityScopeVersion, getIdentityScopeVersion,
  )

  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const socketEpochId = getInGameSocketEpochId(socket)

  // 대기열 맨 앞이 지금 연출
  const current = queue[0] ?? null

  // 판·계정·신원·소켓 세대 범위 (바뀌면 최종 결과 추적 지움)
  const scopeKey = gameId && authUuid
    ? `${gameId}|${authUuid}|${identityGeneration}|${identityScopeVersion}|${socketEpochId}`
    : null

  // 지금 연출이 들어올 때 잡힌 수신 범위
  const capturedReceiptScope = useMemo(() => readNightSuccessReceiptScope(current), [current])

  // 최종 결과 닫기 때 비교할 수신 범위 (범위 축이 바뀔 때만 새로 잡음)
  const capturedCloseScope = useMemo(
    () => readInGameReceiptScope({ accountId: authUuid, identityGeneration }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 아래 축들이 곧 범위의 전이 경계다.
    [authUuid, identityGeneration, identityScopeVersion, socketEpochId, gameId],
  )

  // 최종 결과용 추적: 대상·죽임 봄·치료 봄
  const [track, setTrack] = useState(null)
  // 치료 창이 닫힌 밤 (추적과 따로 둠: 의사 차례 끝이 죽임 연출보다 먼저 와도 안 버리기)
  const [healClosed, setHealClosed] = useState(null)

  // 범위가 바뀌었거나 다른 밤이 시작되면 그리는 중에 추적 지움 (지운 뒤엔 조건이 거짓이라 한 번만)
  const nightStartedElsewhere = gameState?.phase === "NIGHT"
    && Number.isInteger(gameState?.dayIndex)
    && track !== null
    && track.nightDayIndex !== gameState.dayIndex
  if (track !== null && (track.scopeKey !== scopeKey || nightStartedElsewhere)) {
    setTrack(null)
  }

  // 의사 차례가 끝나거나 그 밤 판정이 끝나면 그 밤 치료 창이 닫혔다고 적음
  // (의사 없는 판은 의사 차례 자체가 없어 판정 끝이 마감 알림, 서버는 치료 연출을 판정 전에 보냄)
  useEffect(() => {
    if (!socket || typeof socket.on !== "function") return undefined
    const closeHealWindow = (payload, { requireDoctor }) => {
      // 모양이 틀리거나 의사 차례가 아니거나 다른 판이면 버림
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return
      if (requireDoctor && payload.role !== HEAL_WINDOW_CLOSING_ROLE) return
      if (typeof payload.gameId !== "string" || payload.gameId !== gameId) return
      if (!Number.isInteger(payload.dayIndex)) return
      // 범위와 밤을 같이 적어 두고, 최종 결과 고를 때 추적과 맞춰 봄
      if (!scopeKey) return
      setHealClosed((prev) => (
        prev && prev.scopeKey === scopeKey && prev.nightDayIndex === payload.dayIndex
          ? prev
          : { scopeKey, nightDayIndex: payload.dayIndex }
      ))
    }
    const offTurnEnded = onNightTurnEnded(socket, (payload) => closeHealWindow(payload, { requireDoctor: true }))
    const offResolved = onNightActionsResolved(socket, (payload) => closeHealWindow(payload, { requireDoctor: false }))
    return () => {
      offTurnEnded()
      offResolved()
    }
  }, [socket, gameId, scopeKey])

  // 연출 다 봄: 스토어에 끝맺음 알리고, 죽임·치료면 최종 결과 추적에 적음
  const finish = useCallback((outcome) => {
    if (!current) return
    const entry = current
    const capturedScope = capturedReceiptScope
    if (capturedScope === null) return

    // 연출 들어올 때와 지금 수신 범위가 다르면 안 함
    const auth = useAuthStore.getState()
    const receiptScope = readInGameReceiptScope({
      accountId: auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null,
      identityGeneration: auth.identityGeneration ?? null,
    })
    if (!isSameReceiptScope(capturedScope, receiptScope)) return
    // 이미 끝난 연출이면 추적도 안 건드림
    const result = useInGameStore.getState().completeNightSuccess(entry.eventId, capturedScope, outcome)
    if (!result || result.status === "noop") return

    // 같은 범위·같은 밤·같은 대상 추적이면 합치고, 아니면 새로 시작
    if (FINAL_STATUS_TYPES.has(entry.type) && scopeKey) {
      const targetId = resolveTargetId(entry, authUuid)
      if (targetId) {
        const isKill = entry.type === "KILL"
        setTrack((prev) => {
          if (prev && prev.scopeKey === scopeKey && prev.nightDayIndex === entry.nightDayIndex
            && prev.targetId === targetId) {
            return { ...prev, killDone: prev.killDone || isKill, healDone: prev.healDone || !isKill }
          }
          return {
            scopeKey,
            nightDayIndex: entry.nightDayIndex,
            targetId,
            killDone: isKill,
            healDone: !isKill,
          }
        })
      }
    }
  }, [current, capturedReceiptScope, scopeKey, authUuid])

  // 죽임 봤고 치료도 봤거나 치료 창이 닫혔고, 대기열 비고 결과가 반영됐을 때만 최종 생존 결과
  let finalStatus = null
  let displayedTrack = null
  const healWindowClosed = Boolean(track && healClosed
    && healClosed.scopeKey === track.scopeKey
    && healClosed.nightDayIndex === track.nightDayIndex)
  if (
    track
    && track.scopeKey === scopeKey
    && track.killDone
    && (track.healDone || healWindowClosed)
    && queue.length === 0
    && isResultReflected(gameState, track.nightDayIndex)
  ) {
    // 대상의 생존 값이 판 상태에 있을 때만
    const player = (gameState?.players ?? []).find((p) => p?.uuid === track.targetId) ?? null
    if (player && typeof player.alive === "boolean") {
      finalStatus = { targetId: track.targetId, alive: player.alive }
      displayedTrack = track
    }
  }

  // 최종 결과 닫기 (닫기 범위가 그대로이고 보던 그 추적일 때만 지움)
  const onClose = useCallback(() => {
    if (displayedTrack === null) return
    const auth = useAuthStore.getState()
    const receiptScope = readInGameReceiptScope({
      accountId: auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null,
      identityGeneration: auth.identityGeneration ?? null,
    })
    if (!isSameReceiptScope(capturedCloseScope, receiptScope)) return
    setTrack((prev) => (prev === displayedTrack ? null : prev))
  }, [displayedTrack, capturedCloseScope])

  return {
    current,
    open: !hold && (current !== null || finalStatus !== null),
    pending: current !== null,
    finish,
    finalStatus,
    onClose,
  }
}
