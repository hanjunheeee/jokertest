// 알림 시트 키·포커스 (Esc로 상세면 목록으로·목록이면 닫기, 열리면 닫기 버튼에 포커스)
// 알림 시트(NotificationSheet.jsx)가 씀
import { useEffect } from "react"

import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

// 열려 있을 때만 Esc 들음, 취소 소리 냄
export function useSheetKeys({ open, inDetail, onBack, onClose, closeButtonRef }) {
  useEffect(() => {
    if (!open) return undefined

    // Esc만 받음
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return
      dispatchUiSfx("ui-cancel", event)
      if (inDetail) onBack()
      else onClose?.()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, inDetail, onBack, onClose])

  // 열릴 때·목록으로 돌아올 때 닫기 버튼에 포커스 (화면 읽기 시작점)
  useEffect(() => {
    if (open) closeButtonRef.current?.focus()
  }, [open, inDetail, closeButtonRef])
}
