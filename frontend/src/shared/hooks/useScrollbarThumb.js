// 사용자 스크롤 막대 손잡이 (스크롤·크기 바뀜에 맞춰 위치 맞추기, 손잡이 끌어서 스크롤)
// 공용 Scrollbar 컴포넌트가 씀
import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { CUSTOM_SCROLLBAR_TRACK_INSET } from "@/shared/constants/customScrollbarStyles.js"
import { computeTravelMetrics, scrollTopToThumbTop, thumbTopToScrollTop } from "@/shared/utils/scrollbarThumb.js"

export function useScrollbarThumb(
  scrollRef,
  trackRef,
  thumbRef,
  trackInset = CUSTOM_SCROLLBAR_TRACK_INSET,
) {
  const [thumbTop, setThumbTop] = useState(0)
  const [isScrollable, setIsScrollable] = useState(false)
  const dragStateRef = useRef(null)

  // 스크롤할 게 없으면 손잡이를 숨길 수 있게 isScrollable을 끔
  const sync = useCallback(() => {
    const scrollEl = scrollRef?.current
    const trackEl = trackRef?.current
    const thumbEl = thumbRef?.current

    if (!scrollEl || !trackEl || !thumbEl) return

    const metrics = computeTravelMetrics(scrollEl, trackEl, thumbEl, trackInset)
    const canScroll = metrics.maxScroll > 0

    setIsScrollable(canScroll)

    if (!canScroll) {
      setThumbTop(0)
      return
    }

    setThumbTop(scrollTopToThumbTop(scrollEl.scrollTop, metrics))
  }, [scrollRef, trackRef, thumbRef, trackInset.bottom, trackInset.top])

  // 왼쪽 버튼으로 잡으면 포인터를 붙잡고, 끄는 만큼 손잡이 범위 안에서 스크롤을 옮김
  const onThumbPointerDown = useCallback(
    (event) => {
      const scrollEl = scrollRef?.current
      const trackEl = trackRef?.current
      const thumbEl = thumbRef?.current

      if (!scrollEl || !trackEl || !thumbEl || event.button !== 0) return

      const metrics = computeTravelMetrics(scrollEl, trackEl, thumbEl, trackInset)
      if (metrics.maxScroll <= 0) return

      event.preventDefault()

      const startThumbTop = scrollTopToThumbTop(scrollEl.scrollTop, metrics)
      dragStateRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startThumbTop,
        metrics,
      }

      thumbEl.setPointerCapture(event.pointerId)

      const onPointerMove = (moveEvent) => {
        const dragState = dragStateRef.current
        if (!dragState || moveEvent.pointerId !== dragState.pointerId) return

        const { startY, startThumbTop: originTop, metrics: liveMetrics } =
          dragState
        const maxThumbTop = liveMetrics.insetTopPx + liveMetrics.travelRange
        const nextThumbTop = Math.min(
          maxThumbTop,
          Math.max(
            liveMetrics.insetTopPx,
            originTop + (moveEvent.clientY - startY),
          ),
        )

        scrollEl.scrollTop = thumbTopToScrollTop(nextThumbTop, liveMetrics)
      }

      const endDrag = (endEvent) => {
        const dragState = dragStateRef.current
        if (!dragState || endEvent.pointerId !== dragState.pointerId) return

        dragStateRef.current = null
        thumbEl.releasePointerCapture(endEvent.pointerId)
        thumbEl.removeEventListener("pointermove", onPointerMove)
        thumbEl.removeEventListener("pointerup", endDrag)
        thumbEl.removeEventListener("pointercancel", endDrag)
      }

      thumbEl.addEventListener("pointermove", onPointerMove)
      thumbEl.addEventListener("pointerup", endDrag)
      thumbEl.addEventListener("pointercancel", endDrag)
    },
    [scrollRef, trackRef, thumbRef, trackInset.bottom, trackInset.top],
  )

  // 내용 스크롤·크기 바뀜·자식 바뀜·창 크기·손잡이 그림 로드 때마다 다시 맞춤
  useLayoutEffect(() => {
    const scrollEl = scrollRef?.current
    const trackEl = trackRef?.current
    const thumbEl = thumbRef?.current

    if (!scrollEl || !trackEl || !thumbEl) return undefined

    sync()

    scrollEl.addEventListener("scroll", sync, { passive: true })

    const observer = new ResizeObserver(sync)
    observer.observe(scrollEl)
    observer.observe(trackEl)
    observer.observe(thumbEl)

    const mutationObserver = new MutationObserver(sync)
    mutationObserver.observe(scrollEl, { childList: true, subtree: true })

    window.addEventListener("resize", sync)

    const onThumbLoad = () => sync()
    thumbEl.addEventListener("load", onThumbLoad)
    if (thumbEl.complete) {
      sync()
    }

    return () => {
      scrollEl.removeEventListener("scroll", sync)
      observer.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener("resize", sync)
      thumbEl.removeEventListener("load", onThumbLoad)
    }
  }, [scrollRef, trackRef, thumbRef, sync])

  return { thumbTop, isScrollable, onThumbPointerDown }
}
