// 스냅샷 동기화 훅: 연결·판·신원이 바뀔 때마다 스냅샷을 다시 묻고 처음 판 복구 상태를 돌려줌
// 인게임 화면·결과 화면이 사용 (묻기·응답 판단은 hooks/snapshotSync/), 받기는 socket/ 함수를 부름
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import {
  getIdentityScopeVersion,
  subscribeIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { readTurnStartObservationTarget, readWaitObservationTarget } from "../utils/snapshot/nightObservation.js"
import { onConnect } from "../socket/connection.js"
import { onNightNotices } from "../socket/night.js"
import { setIdentityRebindPending } from "./snapshotSync/rebindPending.js"
import { createSnapshotRequester } from "./snapshotSync/request.js"

// 다시 묶기 기다림 표시는 인게임 화면·시험이 이 경로로 가져감
export {
  getInGameSnapshotRebindPending,
  subscribeInGameSnapshotRebindPending,
  useInGameSnapshotRebindPending,
} from "./snapshotSync/rebindPending.js"

// 스냅샷 다시 묻기 붙이고 처음 판 복구 상태 돌려줌 (checking·ready·recovered·missing·failed)
export function useInGameSessionSnapshotSync() {
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const gameId = useInGameStore((s) => s.gameId)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const identityScopeVersion = useSyncExternalStore(
    subscribeIdentityScope, getIdentityScopeVersion, getIdentityScopeVersion,
  )
  // 판이 이미 있으면 ready, 없으면 내 판 찾기 전이라 checking
  const [bootstrapStatus, setBootstrapStatus] = useState(gameId ? "ready" : "checking")

  // 화면 살아 있음·세대·지난 범위·물은 세대·반영한 범위·다시 묻기 예산·밤 관찰 장부
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

  // 화면 빠지면 다시 묶기 기다림 풀고 예약된 다시 묻기 끔
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

  // 소켓·판·계정·신원이 바뀔 때마다 이번 범위로 묻기를 새로 붙임 (소켓·계정 없으면 안 물음)
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

    // 밤 알림 대상마다 받은 횟수 올림 (묻는 사이 바뀌었는지 비교용)
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

    // 예약된 다시 묻기 끄기
    const cancelScheduledRetry = () => {
      const retry = retryRef.current
      if (retry.timerId !== null) {
        clearTimeout(retry.timerId)
        retry.timerId = null
      }
    }

    // 이번 범위로 묻기 함수 만들기 (본체는 hooks/snapshotSync/request.js)
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

    // 이미 연결돼 있으면 바로 묻기
    if (socket.connected) {
      requestSnapshot()
    }

    // 범위가 바뀌면 받기 떼고 밤 관찰 장부 비움
    return () => {
      offConnect()
      offNightNotices()
      nightObservationsRef.current = new Map()
      cancelScheduledRetry()
    }
  }, [socket, gameId, authUuid, identityGeneration, identityScopeVersion])

  return bootstrapStatus
}
