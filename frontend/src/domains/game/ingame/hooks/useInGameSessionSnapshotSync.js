// 스냅샷 동기화 훅: 연결·판·신원이 바뀔 때마다 스냅샷을 다시 묻고 처음 판 복구 상태를 돌려줌
// 인게임 화면·결과 화면이 사용 (묻기·응답 판단은 hooks/snapshotSync/), 받기는 socket/ 함수를 부름
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import {
  getInGameIdentityScopeVersion,
  subscribeInGameIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { readTurnStartObservationTarget, readWaitObservationTarget } from "../utils/snapshot/nightObservation.js"
import { onConnect } from "../socket/connection.js"
import { onNightNotices } from "../socket/night.js"
import { setIdentityRebindPending } from "./snapshotSync/rebindPending.js"
import { createSnapshotRequester } from "./snapshotSync/request.js"

export {
  getInGameSnapshotRebindPending,
  subscribeInGameSnapshotRebindPending,
  useInGameSnapshotRebindPending,
} from "./snapshotSync/rebindPending.js"

export function useInGameSessionSnapshotSync() {
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const gameId = useInGameStore((s) => s.gameId)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const identityScopeVersion = useSyncExternalStore(
    subscribeInGameIdentityScope, getInGameIdentityScopeVersion, getInGameIdentityScopeVersion,
  )
  const [bootstrapStatus, setBootstrapStatus] = useState(gameId ? "ready" : "checking")

  const mountedRef = useRef(true)
  const epochVersionRef = useRef(0)
  const epochBaseRef = useRef({
    socket: undefined, gameId: undefined, authUuid: undefined,
    identityGeneration: undefined, identityScopeVersion: undefined,
  })
  const requestedVersionRef = useRef(-1)
  const observedBaseRef = useRef(false)
  const fulfilledRef = useRef(null)
  const retryRef = useRef({ epoch: -1, attempts: 0, deadline: 0, timerId: null })
  const nightObservationsRef = useRef(new Map())

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      setIdentityRebindPending(false)
      const retry = retryRef.current
      if (retry.timerId !== null) {
        clearTimeout(retry.timerId)
        retry.timerId = null
      }
    }
  }, [])

  useEffect(() => {
    if (!socket || !authUuid) return

    // 범위가 바뀌었고 방금 내가 반영한 범위도 아니면 새 세대 (판 중이면 다시 묶기 기다림 켬)
    const base = epochBaseRef.current
    const isFirstRun = !observedBaseRef.current
    observedBaseRef.current = true
    const fulfilled = fulfilledRef.current
    const isSelfCommitted = fulfilled !== null
      && fulfilled.socket === socket
      && fulfilled.gameId === gameId
      && fulfilled.authUuid === authUuid
      && fulfilled.identityGeneration === identityGeneration
      && fulfilled.identityScopeVersion === identityScopeVersion
    const changed = base.socket !== socket || base.gameId !== gameId || base.authUuid !== authUuid
      || base.identityGeneration !== identityGeneration
      || base.identityScopeVersion !== identityScopeVersion
    epochBaseRef.current = { socket, gameId, authUuid, identityGeneration, identityScopeVersion }
    if (changed && !isSelfCommitted) {
      epochVersionRef.current += 1
      if (!isFirstRun && gameId && socket.connected) setIdentityRebindPending(true)
    }

    // 지금 소켓·계정으로 받은 밤 알림만 관찰 장부에 셈
    const isObservableNow = () =>
      mountedRef.current && getSocket() === socket
      && (useAuthStore.getState().user?.uuid ?? null) === authUuid

    const noteNightObservation = (key) => {
      if (key === null) return
      const book = nightObservationsRef.current
      book.set(key, (book.get(key) ?? 0) + 1)
    }

    const observeWaitNotice = (payload) => {
      if (!isObservableNow()) return
      noteNightObservation(readWaitObservationTarget(payload))
    }
    const observeTurnStart = (payload) => {
      if (!isObservableNow()) return
      noteNightObservation(readTurnStartObservationTarget(payload))
    }
    const offNightNotices = onNightNotices(socket, observeWaitNotice, observeTurnStart)

    const cancelScheduledRetry = () => {
      const retry = retryRef.current
      if (retry.timerId !== null) {
        clearTimeout(retry.timerId)
        retry.timerId = null
      }
    }

    const requestSnapshot = createSnapshotRequester({
      socket, gameId, authUuid, identityGeneration,
      mountedRef, epochVersionRef, requestedVersionRef, fulfilledRef, retryRef, nightObservationsRef,
      setBootstrapStatus, cancelScheduledRetry,
    })

    // 다시 연결되면 새 세대로 올리고, 이번 틱이 끝난 뒤에도 그대로면 묻기
    const handleConnect = () => {
      epochVersionRef.current += 1
      if (useInGameStore.getState().gameId) setIdentityRebindPending(true)
      cancelScheduledRetry()

      const scheduledEpochVersion = epochVersionRef.current
      const scheduledSocket = socket
      queueMicrotask(() => {
        if (!mountedRef.current) return
        if (epochVersionRef.current !== scheduledEpochVersion) return
        if (getSocket() !== scheduledSocket) return
        requestSnapshot()
      })
    }

    const offConnect = onConnect(socket, handleConnect)

    if (socket.connected) {
      requestSnapshot()
    }

    return () => {
      offConnect()
      offNightNotices()
      nightObservationsRef.current = new Map()
      cancelScheduledRetry()
    }
  }, [socket, gameId, authUuid, identityGeneration, identityScopeVersion])

  return bootstrapStatus
}
