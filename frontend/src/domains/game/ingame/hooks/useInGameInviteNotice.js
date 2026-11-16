// 판 화면에 있는 동안 새 대기방 초대가 오면 "로비로 나가면 수락" 안내 한 줄 띄우기
// PC·모바일 판 화면이 씀, 초대는 로비 초대 스토어에 이미 들어온 것을 읽기만 함 (수락 창은 로비에만)
import { useCallback, useEffect, useState } from "react"
import { useGameInviteStore } from "../../../lobby/store/gameInvite.store.js"
import { selectPending } from "../../../lobby/utils/gameInvite/invites.js"

// 안내가 떠 있는 시간 (닫기 단추로 먼저 닫을 수도 있음)
export const INVITE_NOTICE_MS = 8000

// 안내 글 (보낸 사람 이름이 없으면 이름 없이)
// 예: "민수" → "민수 님이 대기방으로 초대했습니다. 게임에서 나가 로비로 가면 수락할 수 있습니다."
export function inviteNoticeText(senderName) {
  const who = typeof senderName === "string" && senderName.trim() ? `${senderName.trim()} 님이` : "누군가"
  return `${who} 대기방으로 초대했습니다. 게임에서 나가 로비로 가면 수락할 수 있습니다.`
}

// 대기 중 초대 id 묶음
const pendingIds = (invites) => new Set(selectPending(invites).map((invite) => invite.inviteId))

// 판 화면에 들어올 때 이미 있던 초대는 안 띄움, 그 뒤 처음 보는 대기 초대만 (같은 초대가 다시 와도 한 번)
export function useInGameInviteNotice() {
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    const seen = pendingIds(useGameInviteStore.getState().invites)
    return useGameInviteStore.subscribe((state) => {
      // 목록은 새 순번이 앞이라 첫 줄이 가장 새 초대
      const fresh = selectPending(state.invites).filter((invite) => !seen.has(invite.inviteId))
      if (fresh.length === 0) return
      for (const invite of fresh) seen.add(invite.inviteId)
      setNotice({ id: fresh[0].inviteId, text: inviteNoticeText(fresh[0].senderName) })
    })
  }, [])

  // 새 안내마다 시간 다시 셈
  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(null), INVITE_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const dismiss = useCallback(() => setNotice(null), [])

  return { notice, dismiss }
}
