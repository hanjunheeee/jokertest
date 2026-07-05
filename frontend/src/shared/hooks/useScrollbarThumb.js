import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { CUSTOM_SCROLLBAR_TRACK_INSET } from "@/shared/constants/customScrollbarStyles.js"

function computeTravelMetrics(scrollEl, trackEl, thumbEl, trackInset) {
  const trackHeight = trackEl.clientHeight
  const thumbHeight = thumbEl.offsetHeight
  const insetTopPx = trackHeight * trackInset.top
  const insetBottomPx = trackHeight * trackInset.bottom
  const travelRange = Math.max(
    trackHeight - insetTopPx - insetBottomPx - thumbHeight,
    0,
  )
  const maxScroll = Math.max(scrollEl.scrollHeight - scrollEl.clientHeight, 0)

  return { insetTopPx, travelRange, maxScroll }
}

function scrollTopToThumbTop(scrollTop, metrics) {
  const { insetTopPx, travelRange, maxScroll } = metrics
  if (maxScroll <= 0 || travelRange <= 0) return insetTopPx
  return insetTopPx + (scrollTop / maxScroll) * travelRange
}

function thumbTopToScrollTop(thumbTop, metrics) {
  const { insetTopPx, travelRange, maxScroll } = metrics
  if (travelRange <= 0 || maxScroll <= 0) return 0
  const ratio = (thumbTop - insetTopPx) / travelRange
  return Math.min(maxScroll, Math.max(0, ratio * maxScroll))
}

/**
 * 스크롤 컨테이너 scrollTop에 맞춰 썸 top(px)을 계산하고, 썸 드래그를 지원합니다.
 *
 * @param {React.RefObject<HTMLElement|null>} scrollRef
 * @param {React.RefObject<HTMLElement|null>} trackRef
 * @param {React.RefObject<HTMLElement|null>} thumbRef
 * @param {{ top: number, bottom: number }} trackInset — 트랙 장식 구간 (높이 비율)
 */
export function useScrollbarThumb(
  scrollRef,
  trackRef,
  thumbRef,
  trackInset = CUSTOM_SCROLLBAR_TRACK_INSET,
) {
  const [thumbTop, setThumbTop] = useState(0)
  const [isScrollable, setIsScrollable] = useState(false)
  const dragStateRef = useRef(null)

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
