// 친구 목록 패널의 지금 탭 (알림에서 신청·초대를 눌러 열면 그 탭으로 감)
// FriendListPanel이 맨 처음 부름
import { useEffect, useState } from "react"

// 열린 상태에서 대상 신청·초대가 들어오면 그 탭으로 옮김
export function usePanelView(open, targetRequestId, targetInviteId) {
  const [panelView, setPanelView] = useState("list")

  useEffect(() => {
    if (!open || targetRequestId == null) return
    setPanelView("accept")
  }, [open, targetRequestId])

  useEffect(() => {
    if (!open || targetInviteId === null) return
    setPanelView("invite")
  }, [open, targetInviteId])

  return [panelView, setPanelView]
}
