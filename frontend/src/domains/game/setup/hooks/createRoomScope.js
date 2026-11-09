// 방 만들기 요청 범위(계정·소켓·소속) 잡기와 지금도 그대로인지 확인
// useCreateRoom·createRoomRequest가 씀, 응답 올 때 하나라도 바뀌었으면 그 응답은 버리려고
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { getSocket } from "@/shared/socket/socketClient.js"
import { isSameScope, readScope } from "../utils/membershipScope.js"

// 지금 계정·소켓·소속 범위 잡기 (token은 범위마다 새 객체)
export const captureScope = (socket, accountId, identityGeneration) => ({
  token: {},
  accountId,
  identityGeneration,
  socket,
  socketId: socket?.id ?? null,
  membership: readScope(),
})

// 잡아 둔 범위가 지금도 그대로인지 (마지막 요청 하나만 살아 있음)
export function isScopeCurrent(scopeRef, scope) {
  if (scope === null || scopeRef.current !== scope) return false
  const auth = useAuthStore.getState()
  if ((auth.user?.uuid ?? null) !== scope.accountId) return false
  if (auth.identityGeneration !== scope.identityGeneration) return false
  const socket = getSocket()
  if (socket !== scope.socket) return false
  if ((socket?.id ?? null) !== scope.socketId) return false
  return isSameScope(readScope(), scope.membership)
}
