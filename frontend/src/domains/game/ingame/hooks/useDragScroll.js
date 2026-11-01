// 채팅 목록 끌어 스크롤 훅: 마우스로 누른 채 끌면 위아래로 스크롤
// 채팅 메시지 목록(InGameChatMessageList)이 사용
import { useEffect } from "react"

// 스크롤 칸에 누르기·끌기·놓기 받기를 붙이고 화면 빠지면 뗌
export function useDragScroll(scrollRef) {
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return undefined

    let pointerId = null
    let startY = 0
    let startScrollTop = 0

    // 왼쪽 버튼만 끌기 시작 (끄는 동안 글이 잡히지 않게 선택 지움)
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

    // 누른 그 포인터만 따라 스크롤
    const onPointerMove = (event) => {
      if (event.pointerId !== pointerId) return
      scrollEl.scrollTop = startScrollTop - (event.clientY - startY)
    }

    // 놓거나 취소되면 끌기 끝
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
