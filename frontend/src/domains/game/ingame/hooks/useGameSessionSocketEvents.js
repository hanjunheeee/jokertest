// 판 진행 이벤트 훅 입구: 판 진행 공개 사건 구독과 연결·계정 감시를 순서대로 붙임
// 로그인 보호 경로(ProtectedRoute)가 부름 (손잡이는 hooks/sessionEvents/, on/off는 socket/session.js)
import { useEffect, useSyncExternalStore } from "react"
import { useNavigate } from "react-router-dom"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import {
  getIdentityScopeVersion,
  subscribeIdentityScope,
} from "../store/ingameStore.js"
import { onSessionEvents } from "../socket/session.js"
import { onConnect } from "../socket/connection.js"
import { currentReceiptScope } from "./sessionEvents/scope.js"
import { createDayHandlers } from "./sessionEvents/dayHandlers.js"
import { createNightHandlers } from "./sessionEvents/nightHandlers.js"
import { createRoomHandlers } from "./sessionEvents/roomHandlers.js"
import { useConnectSeq } from "./sessionEvents/useSessionConnection.js"
import { useAccountCacheRefresh } from "./sessionEvents/useAccountCacheRefresh.js"

// 판 진행 공개 사건 구독과 계정 캐시 감시 붙이기 (끊김 때는 판 정리 안 함, 다시 붙으면 스냅샷이 맞춤)
export function useGameSessionSocketEvents() {
  const navigate = useNavigate()
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const identityScopeVersion = useSyncExternalStore(
    subscribeIdentityScope, getIdentityScopeVersion, getIdentityScopeVersion,
  )
  const connectSeq = useConnectSeq(socket)

  // 연결·계정·신원 범위·재연결이 바뀔 때마다 지금 범위로 구독을 새로 붙임
  useEffect(() => {
    if (!socket) return
    const registered = { ...currentReceiptScope() }
    // 다시 연결되면 연결 범위만 바로 새로 적음 (다시 구독하기 전 틈에 온 사건도 받기)
    // 연결 세대를 올리는 useConnectSeq의 받기가 먼저 붙어 있어 올린 뒤 값을 읽음
    const offConnectRefresh = onConnect(socket, () => {
      const now = currentReceiptScope()
      registered.socketEpoch = now.socketEpoch
      registered.socketId = now.socketId
      registered.socketConnected = now.socketConnected
    })
    const offEvents = onSessionEvents(socket, {
      ...createRoomHandlers(registered, navigate),
      ...createDayHandlers(registered),
      ...createNightHandlers(registered),
    })
    return () => {
      offConnectRefresh()
      offEvents()
    }
  }, [socket, navigate, authUuid, identityGeneration, identityScopeVersion, connectSeq])

  // 계정 캐시 새로 받기
  useAccountCacheRefresh(socket)
}
