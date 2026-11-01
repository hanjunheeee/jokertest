// 방 만들기 요청 때 잡아 두는 소속 범위 (대기방·인게임 영수증)와 같은지 비교
// hooks/useCreateRoom이 씀, 스토어는 읽기만 함
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { readInGameReceiptScope } from "@/domains/game/ingame/store/ingameStore.js"

// 지금 소속 범위 읽기
export function readScope() {
  const matching = useMatchingStore.getState()
  const receipt = readInGameReceiptScope()
  return {
    isInRoom: matching.isInRoom === true,
    roomId: matching.roomId ?? null,
    roomInstanceId: matching.roomInstanceId ?? null,
    gameId: receipt.gameId,
    membershipId: receipt.membershipId,
    membershipEpoch: receipt.membershipEpoch,
  }
}

// 두 소속 범위가 같은지 (하나라도 다르면 그사이 방·판이 바뀐 것)
export function isSameScope(a, b) {
  if (a === null || typeof a !== "object" || b === null || typeof b !== "object") return false
  return a.isInRoom === b.isInRoom
    && a.roomId === b.roomId
    && a.roomInstanceId === b.roomInstanceId
    && a.gameId === b.gameId
    && a.membershipId === b.membershipId
    && a.membershipEpoch === b.membershipEpoch
}
