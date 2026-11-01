// 판 나가기 요청 만들기: 보낸 뒤 판·계정·신원·소켓·소속이 그대로일 때만 결과를 받음
// 나가기 훅(useInGameExit)이 사용, 보내기는 socket/session.js가 맡음
import { emitLeave } from "../socket/session.js"

export function createLeaveGameSessionRequest({
  getSocket,
  getCurrentGameId,
  getCurrentAccountId = () => null,
  getCurrentMembershipId = () => null,
  getIdentityGeneration = () => null,
  finalize,
  onFailure,
}) {
  return () => {
    const socket = getSocket()
    if (!socket) return false

    const requestedGameId = getCurrentGameId()
    if (!requestedGameId) return false
    const requestedAccountId = getCurrentAccountId()
    const requestedMembershipId = getCurrentMembershipId()
    const requestedIdentityGeneration = getIdentityGeneration()
    const requestedSocketId = socket?.id ?? null

    emitLeave(socket, requestedGameId, (response) => {
      // 보낸 때와 범위가 하나라도 다르면 옛 응답으로 보고 버림
      if (getCurrentGameId() !== requestedGameId) return
      if (getCurrentAccountId() !== requestedAccountId) return
      if (getIdentityGeneration() !== requestedIdentityGeneration) return
      if (getSocket() !== socket) return
      if ((socket?.id ?? null) !== requestedSocketId) return
      if (getCurrentMembershipId() !== requestedMembershipId) return
      if (response?.ok) {
        finalize()
        return
      }
      onFailure?.(response)
    })
    return true
  }
}
