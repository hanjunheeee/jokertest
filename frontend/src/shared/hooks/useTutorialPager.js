// 튜토리얼 창 페이지 넘기기 (열 때 첫 페이지·Esc 닫기·좌우 화살표 키)
// TutorialGuideOverlay가 씀
import { useEffect, useState } from "react"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

export function useTutorialPager({ open, onClose, slideCount }) {
  const [mounted, setMounted] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)

  // document.body가 생긴 뒤에만 포털을 그림
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open) setPageIndex(0)
  }, [open])

  // 열려 있을 때만 키를 받음, Esc는 취소 소리를 내고 닫음
  useEffect(() => {
    if (!open || slideCount === 0) return undefined

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        dispatchUiSfx("ui-cancel", event)
        onClose()
        return
      }
      if (event.key === "ArrowLeft") {
        setPageIndex((prev) => Math.max(0, prev - 1))
      }
      if (event.key === "ArrowRight") {
        setPageIndex((prev) => Math.min(slideCount - 1, prev + 1))
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose, slideCount])

  return { mounted, pageIndex, setPageIndex }
}
