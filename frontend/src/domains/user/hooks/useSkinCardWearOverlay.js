import { useState } from "react"

/** 스킨&카드 착용 — 오버레이 open/close (MyPageLayout 연동) */
export function useSkinCardWearOverlay() {
  const [open, setOpen] = useState(false)

  return {
    open,
    openOverlay: () => setOpen(true),
    closeOverlay: () => setOpen(false),
  }
}
