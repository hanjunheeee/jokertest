// 친구 목록 패널의 지금 탭 (알림에서 신청·초대를 눌러 열면 그 탭으로 감)
// FriendListPanel이 맨 처음 부름
import { useEffect, useState } from "react"

// 열린 상태에서 대상 신청·초대가 들어오면 그 탭으로 옮김
export function usePanelView(open, targetRequestId, targetInviteId) {
  const [panelView, setPanelView] = useState("list")

  // 받은 신청 대상이 오면 요청 수락 탭으로
  useEffect(() => {
    if (!open || targetRequestId == null) return
    setPanelView("accept")
  }, [open, targetRequestId])

  // 게임 초대 대상이 오면 게임 초대 탭으로
  useEffect(() => {
    if (!open || targetInviteId === null) return
    setPanelView("invite")
  }, [open, targetInviteId])

  return [panelView, setPanelView]
}
