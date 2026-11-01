// 스킨·카드 장착 창 열림 상태 훅
// 지금은 시험만 씀 (마이페이지는 MyPageLayout이 useState로 직접 둠)
import { useState } from "react"

// 열기·닫기 함수 묶음
export function useSkinCardWearOverlay() {
  const [open, setOpen] = useState(false)

  return {
    open,
    openOverlay: () => setOpen(true),
    closeOverlay: () => setOpen(false),
  }
}
