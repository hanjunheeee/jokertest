// 파일 역할: useDragScroll.js - React 상태와 부수효과를 묶는 커스텀 훅입니다.
import { useEffect } from "react"

/**
 * overflow 컨테이너 — 포인터 드래그로 세로 스크롤
 *
 * @param {React.RefObject<HTMLElement|null>} scrollRef
 */
export function useDragScroll(scrollRef) {
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return undefined

    let pointerId = null
    let startY = 0
    let startScrollTop = 0

    const onPointerDown = (event) => {
      if (event.button !== 0) return

      event.preventDefault()
      window.getSelection()?.removeAllRanges()

      pointerId = event.pointerId
      startY = event.clientY
      startScrollTop = scrollEl.scrollTop
      scrollEl.setPointerCapture(event.pointerId)
      scrollEl.classList.add("cursor-grabbing")
    }

    const onPointerMove = (event) => {
      if (event.pointerId !== pointerId) return
      scrollEl.scrollTop = startScrollTop - (event.clientY - startY)
    }

    const endDrag = (event) => {
      if (event.pointerId !== pointerId) return

      pointerId = null
      scrollEl.releasePointerCapture(event.pointerId)
      scrollEl.classList.remove("cursor-grabbing")
    }

    scrollEl.addEventListener("pointerdown", onPointerDown)
    scrollEl.addEventListener("pointermove", onPointerMove)
    scrollEl.addEventListener("pointerup", endDrag)
    scrollEl.addEventListener("pointercancel", endDrag)

    return () => {
      scrollEl.removeEventListener("pointerdown", onPointerDown)
      scrollEl.removeEventListener("pointermove", onPointerMove)
      scrollEl.removeEventListener("pointerup", endDrag)
      scrollEl.removeEventListener("pointercancel", endDrag)
    }
  }, [scrollRef])
}
