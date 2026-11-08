// 그림 스크롤 막대 손잡이 위치 맞추기 (스크롤·크기·자식 바뀜마다), 끌기는 없음
// 모바일 shared/ui/scroll/Scrollbar가 씀
import { useCallback, useLayoutEffect, useState } from "react"
import { CUSTOM_SCROLLBAR_TRACK_INSET } from "@/shared/constants/customScrollbarStyles.js"
import { computeTravelMetrics, scrollTopToThumbTop } from "@/shared/utils/scrollbarThumb.js"

// 손잡이 위치·스크롤할 게 있는지 돌려줌 (폰은 목록을 손가락으로 밀어서 스크롤함)
export function useScrollThumbTop(scrollRef, trackRef, thumbRef, syncKey) {
  const [thumbTop, setThumbTop] = useState(0)
  const [isScrollable, setIsScrollable] = useState(false)

  const sync = useCallback(() => {
    const scrollEl = scrollRef?.current
    const trackEl = trackRef?.current
    const thumbEl = thumbRef?.current
    if (!scrollEl || !trackEl || !thumbEl) return
    const metrics = computeTravelMetrics(scrollEl, trackEl, thumbEl, CUSTOM_SCROLLBAR_TRACK_INSET)
    const canScroll = metrics.maxScroll > 0
    setIsScrollable(canScroll)
    setThumbTop(canScroll ? scrollTopToThumbTop(scrollEl.scrollTop, metrics) : 0)
  }, [scrollRef, trackRef, thumbRef])

  useLayoutEffect(() => {
    const scrollEl = scrollRef?.current
    const trackEl = trackRef?.current
    const thumbEl = thumbRef?.current
    if (!scrollEl || !trackEl || !thumbEl) return undefined
    sync()
    scrollEl.addEventListener("scroll", sync, { passive: true })
    const resize = new ResizeObserver(sync)
    resize.observe(scrollEl)
    resize.observe(trackEl)
    resize.observe(thumbEl)
    const mutation = new MutationObserver(sync)
    mutation.observe(scrollEl, { childList: true, subtree: true })
    // 그림이 늦게 받아지면 손잡이 높이가 바뀜
    thumbEl.addEventListener("load", sync)
    return () => {
      scrollEl.removeEventListener("scroll", sync)
      resize.disconnect()
      mutation.disconnect()
      thumbEl.removeEventListener("load", sync)
    }
  }, [scrollRef, trackRef, thumbRef, sync, syncKey])

  return { thumbTop, isScrollable }
}
