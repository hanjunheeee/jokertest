// 자리 목록에 이름·방장·나 표시 붙이기 (데스크톱 buildSlots는 실루엣용 값만 줌)
// 대기방 모바일 페이지가 씀, 카드에 이름을 같이 보여 주려고 방 사람 목록에서 찾아 붙임
import { useMemo } from "react"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"

// 자리 카드 값 목록
export function useSlotCards(slots) {
  const players = useMatchingStore((s) => s.players)
  const hostUuid = useMatchingStore((s) => s.hostUuid)
  const isInRoom = useMatchingStore((s) => s.isInRoom)
  const myUuid = useAuthStore((s) => s.user?.uuid ?? null)

  return useMemo(() => {
    const byUuid = new Map((players ?? []).map((player) => [player?.uuid, player]))
    return (slots ?? []).map((slot) => {
      // 방 밖 미리보기 자리는 이름 없음 (숫자 id)
      const player = isInRoom ? byUuid.get(slot.id) : null
      return {
        id: slot.id,
        ready: Boolean(slot.ready),
        nickname: player?.nickname ?? null,
        isHost: Boolean(player && player.uuid === hostUuid),
        isMe: Boolean(player && myUuid && player.uuid === myUuid),
      }
    })
  }, [slots, players, hostUuid, isInRoom, myUuid])
}
