// 클라이언트에 방이 없는데 서버엔 소속인 경우 대기방으로 맞춤
// 방 만들기 직후·목록에서 입장 실패(ALREADY_IN_ROOM) 복구에 씀
import { getSocket } from "@/shared/socket/socketClient.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { askRoom } from "@/domains/game/matching/socket/room.js"
import { canStayOnMatchingPage } from "@/domains/game/matching/utils/canStayOnMatchingPage.js"
import { useAuthStore } from "@/domains/auth/store/auth.store"

// 서버에 방이 있으면 스토어 채우고 대기방으로 보냄 (성공 시 true)
export async function recoverMatchingRoom(navigate) {
  const matching = useMatchingStore.getState()
  if (matching.isInRoom) return false
  if (matching.roomRecoverSuppressUntil > Date.now()) return false
  const socket = getSocket()
  if (!socket) return false

  try {
    const response = await askRoom(socket)
    if (!response?.ok || !response.room) return false
    const myUuid = useAuthStore.getState().user?.uuid ?? null
    const players = Array.isArray(response.room.players) ? response.room.players : []
    const roomId = response.room.roomId ?? response.room.id ?? null
    if (!canStayOnMatchingPage({
      awaiting: false,
      isInRoom: true,
      roomId,
      players,
      myUuid,
    })) {
      return false
    }
    useInGameStore.getState().clearGame()
    useMatchingStore.getState().setRoom(response.room)
    queueMicrotask(() => navigate("/game-matching", { replace: true }))
    return true
  } catch {
    return false
  }
}