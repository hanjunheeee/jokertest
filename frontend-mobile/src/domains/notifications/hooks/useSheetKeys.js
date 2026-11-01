// 알림 시트 키·포커스 (Esc로 상세면 목록으로·목록이면 닫기, 열리면 닫기 버튼에 포커스)
// 알림 시트(NotificationSheet.jsx)가 씀
import { useEffect } from "react"

import { useEscapeClose } from "@m/shared/hooks/useEscapeClose.js"

// 열려 있을 때만 Esc 들음, 취소 소리 냄
export function useSheetKeys({ open, inDetail, onBack, onClose, closeButtonRef }) {
  useEscapeClose(open, inDetail ? onBack : onClose, { sfx: true })

  // 열릴 때·목록으로 돌아올 때 닫기 버튼에 포커스 (화면 읽기 시작점)
  useEffect(() => {
    if (open) closeButtonRef.current?.focus()
  }, [open, inDetail, closeButtonRef])
}
