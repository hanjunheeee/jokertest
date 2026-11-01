// 사용자 스크롤 막대 손잡이 위치 계산 (스크롤 위치와 손잡이 위치 서로 바꾸기)
// useScrollbarThumb 훅이 씀

// 막대 위아래 여백을 뺀 손잡이 이동 범위와 내용 스크롤 최대값
export function computeTravelMetrics(scrollEl, trackEl, thumbEl, trackInset) {
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

// 스크롤 위치 → 손잡이 위치 (스크롤할 게 없으면 맨 위)
export function scrollTopToThumbTop(scrollTop, metrics) {
  const { insetTopPx, travelRange, maxScroll } = metrics
  if (maxScroll <= 0 || travelRange <= 0) return insetTopPx
  return insetTopPx + (scrollTop / maxScroll) * travelRange
}

// 손잡이 위치 → 스크롤 위치 (0~최대로 자름)
export function thumbTopToScrollTop(thumbTop, metrics) {
  const { insetTopPx, travelRange, maxScroll } = metrics
  if (travelRange <= 0 || maxScroll <= 0) return 0
  const ratio = (thumbTop - insetTopPx) / travelRange
  return Math.min(maxScroll, Math.max(0, ratio * maxScroll))
}
