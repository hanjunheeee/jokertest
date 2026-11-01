// 밤 성공 연출 훅: 대기열 맨 앞 연출을 고르고, 다 보면 끝맺음 알림
// 인게임 화면·밤 성공 연출 컴포넌트가 사용, 의사 차례 끝 받기는 socket/night.js를 부름
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import {
  getInGameIdentityScopeVersion,
  isSameInGameReceiptScope,
  readInGameReceiptScope,
  readNightSuccessReceiptScope,
  selectNightSuccessQueue,
  subscribeInGameIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { getInGameSocketEpochId } from "../utils/getInGameSocketEpochId.js"
import { resolveNightSuccessVideo } from "../utils/resolveNightSuccessVideo.js"
import { onNightTurnEnded } from "../socket/night.js"

const HEAL_WINDOW_CLOSING_ROLE = "DOCTOR"

const NIGHT_SUCCESS_FINAL_STATUS_TYPES = new Set(["KILL", "HEAL"])

function resolveNightSuccessTargetId(entry, selfUuid) {
  if (typeof entry?.targetId === "string" && entry.targetId.length > 0) return entry.targetId
  if (Array.isArray(entry?.perspectives) && entry.perspectives.includes("TARGET")) {
    return typeof selfUuid === "string" && selfUuid.length > 0 ? selfUuid : null
  }
  return null
}

function isInGameNightResultReflected(state, nightDayIndex) {
  if (!state || !Number.isInteger(state.dayIndex)) return false
  if (state.phase === "NIGHT") return false
  return state.dayIndex > nightDayIndex || state.phase === "ENDED"
}

export function useInGameNightSuccessPresentation({ hold = false } = {}) {
  const queue = useInGameStore(selectNightSuccessQueue)
  const gameId = useInGameStore((s) => s.gameId)
  const gameState = useInGameStore((s) => s.state)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const identityScopeVersion = useSyncExternalStore(
    subscribeInGameIdentityScope, getInGameIdentityScopeVersion, getInGameIdentityScopeVersion,
  )

  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const socketEpochId = getInGameSocketEpochId(socket)

  const current = queue[0] ?? null

  const scopeKey = gameId && authUuid
    ? `${gameId}|${authUuid}|${identityGeneration}|${identityScopeVersion}|${socketEpochId}`
    : null

  const capturedReceiptScope = useMemo(() => readNightSuccessReceiptScope(current), [current])

  const capturedCloseScope = useMemo(
    () => readInGameReceiptScope({ accountId: authUuid, identityGeneration }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 아래 축들이 곧 범위의 전이 경계다.
    [authUuid, identityGeneration, identityScopeVersion, socketEpochId, gameId],
  )

  const [track, setTrack] = useState(null)

  useEffect(() => {
    setTrack(null)
  }, [scopeKey])

  useEffect(() => {
    if (gameState?.phase !== "NIGHT" || !Number.isInteger(gameState?.dayIndex)) return
    setTrack((prev) => (prev && prev.nightDayIndex === gameState.dayIndex ? prev : null))
  }, [gameState?.phase, gameState?.dayIndex])

  // 의사 차례가 끝나면 그 밤 치료 창이 닫혔다고 적음
  useEffect(() => {
    if (!socket || typeof socket.on !== "function") return undefined
    const handleNightTurnEnded = (payload) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return
      if (payload.role !== HEAL_WINDOW_CLOSING_ROLE) return
      if (typeof payload.gameId !== "string" || payload.gameId !== gameId) return
      if (!Number.isInteger(payload.dayIndex)) return
      setTrack((prev) => {
        if (!prev || prev.scopeKey !== scopeKey || prev.nightDayIndex !== payload.dayIndex) return prev
        if (prev.healWindowClosed) return prev
        return { ...prev, healWindowClosed: true }
      })
    }
    return onNightTurnEnded(socket, handleNightTurnEnded)
  }, [socket, gameId, scopeKey])

  const finish = useCallback((outcome) => {
    if (!current) return
    const entry = current
    const capturedScope = capturedReceiptScope
    if (capturedScope === null) return

    const auth = useAuthStore.getState()
    const receiptScope = readInGameReceiptScope({
      accountId: auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null,
      identityGeneration: auth.identityGeneration ?? null,
    })
    if (!isSameInGameReceiptScope(capturedScope, receiptScope)) return
    const result = useInGameStore.getState().completeNightSuccess(entry.eventId, capturedScope, outcome)
    if (!result || result.status === "noop") return

    if (NIGHT_SUCCESS_FINAL_STATUS_TYPES.has(entry.type) && scopeKey) {
      const targetId = resolveNightSuccessTargetId(entry, authUuid)
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
            healWindowClosed: false,
          }
        })
      }
    }
  }, [current, capturedReceiptScope, scopeKey, authUuid])

  let finalStatus = null
  let displayedTrack = null
  if (
    track
    && track.scopeKey === scopeKey
    && track.killDone
    && (track.healDone || track.healWindowClosed)
    && queue.length === 0
    && isInGameNightResultReflected(gameState, track.nightDayIndex)
  ) {
    const player = (gameState?.players ?? []).find((p) => p?.uuid === track.targetId) ?? null
    if (player && typeof player.alive === "boolean") {
      finalStatus = { targetId: track.targetId, alive: player.alive }
      displayedTrack = track
    }
  }

  const onClose = useCallback(() => {
    if (displayedTrack === null) return
    const auth = useAuthStore.getState()
    const receiptScope = readInGameReceiptScope({
      accountId: auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null,
      identityGeneration: auth.identityGeneration ?? null,
    })
    if (!isSameInGameReceiptScope(capturedCloseScope, receiptScope)) return
    setTrack((prev) => (prev === displayedTrack ? null : prev))
  }, [displayedTrack, capturedCloseScope])

  return {
    current,
    open: !hold && (current !== null || finalStatus !== null),
    pending: current !== null,
    finish,
    assetStatus: current ? (resolveNightSuccessVideo(current) ? "AVAILABLE" : "PENDING") : null,
    finalStatus,
    onClose,
  }
}
