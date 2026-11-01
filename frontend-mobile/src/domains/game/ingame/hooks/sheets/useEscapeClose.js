// 열린 시트를 Esc로 닫기 (취소 소리 같이)
// sheets/frame/Sheet.jsx가 씀 (store 영역 useEscapeClose 복사본)
import { useEffect } from "react"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

// 열려 있을 때만 듣고 닫히면 떼어 냄 (태블릿 키보드 대비, 데스크톱 겹창과 같은 동작)
export function useEscapeClose(open, onClose) {
    useEffect(() => {
        if (!open) return undefined

        const onKeyDown = (event) => {
            if (event.key !== "Escape") return
            dispatchUiSfx("ui-cancel", event)
            onClose()
        }

        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [open, onClose])
}
