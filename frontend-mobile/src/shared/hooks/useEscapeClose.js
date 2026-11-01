// 열린 동안 Esc 키로 닫기 (태블릿·키보드 연결 폰), sfx면 취소 소리 같이
// 시트들(상점·친구·대기방·착용·서고·알림)이 씀
import { useEffect, useRef } from "react"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

// 닫기 함수는 ref로 들고 있어 그릴 때마다 키 구독을 다시 걸지 않음
export function useEscapeClose(open, onClose, { sfx = false } = {}) {
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return
      if (sfx) dispatchUiSfx("ui-cancel", event)
      closeRef.current?.()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, sfx])
}
