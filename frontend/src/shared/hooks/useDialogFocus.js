// 창이 열리면 창으로 초점 옮기고 닫히면 연 곳으로 되돌림 (Tab이 뒤 화면으로 빠지지 않게, FE-048)
// 테두리 확대 창·튜토리얼 창이 씀
import { useEffect } from "react"

// open이 참이 되는 순간 ref 요소에 초점(tabIndex=-1 필요), 거짓이 되거나 사라질 때 이전 초점으로
export function useDialogFocus(open, dialogRef) {
  useEffect(() => {
    if (!open) return undefined
    const opener = typeof document !== "undefined" ? document.activeElement : null
    // 포털·움직임이 그려진 다음 차례에 초점 (바로 하면 아직 요소가 없을 수 있음)
    const timer = setTimeout(() => dialogRef.current?.focus?.(), 0)
    return () => {
      clearTimeout(timer)
      if (opener && typeof opener.focus === "function" && opener.isConnected) opener.focus()
    }
  }, [open, dialogRef])
}
