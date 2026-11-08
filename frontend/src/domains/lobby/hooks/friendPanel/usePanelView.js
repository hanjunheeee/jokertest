// 친구 목록 패널의 지금 탭 (알림에서 신청·초대를 눌러 열면 그 탭으로 감)
// FriendListPanel이 맨 처음 부름
import { useState } from "react"

// 열린 상태에서 대상 신청·초대가 들어오면 그 탭으로 옮김
// effect 안 setState 대신 그리는 중에 열림·대상 바뀜을 보고 맞춤 (초대가 신청보다 나중이라 둘 다 바뀌면 초대 탭)
export function usePanelView(open, targetRequestId, targetInviteId) {
  const [panelView, setPanelView] = useState(() => {
    if (open && targetInviteId !== null) return "invite"
    if (open && targetRequestId != null) return "accept"
    return "list"
  })
  const [seen, setSeen] = useState({ open, targetRequestId, targetInviteId })

  if (seen.open !== open || seen.targetRequestId !== targetRequestId || seen.targetInviteId !== targetInviteId) {
    const requestChanged = seen.open !== open || seen.targetRequestId !== targetRequestId
    const inviteChanged = seen.open !== open || seen.targetInviteId !== targetInviteId
    setSeen({ open, targetRequestId, targetInviteId })
    // 받은 신청 대상이 오면 요청 수락 탭으로, 게임 초대 대상이 오면 게임 초대 탭으로
    if (open && inviteChanged && targetInviteId !== null) setPanelView("invite")
    else if (open && requestChanged && targetRequestId != null) setPanelView("accept")
  }

  return [panelView, setPanelView]
}
