// 좌우로 쓸어 쪽 넘기기 (터치 시작·끝 위치만 봄)
// book/BookSheet.jsx가 씀
import { useRef } from "react"

// 세로 스크롤과 안 섞이게 가로로 충분히 움직였을 때만 넘김
const MIN_DISTANCE = 56
const HORIZONTAL_RATIO = 1.5

// 왼쪽으로 쓸면 다음, 오른쪽으로 쓸면 이전, data-no-swipe 안에서 시작하면 무시 (슬라이더 등)
export function useSwipe({ onNext, onPrev }) {
  // 시작점은 그사이 다시 그려져도 남게 ref에 둠
  const startRef = useRef(null)

  const onTouchStart = (event) => {
    const touch = event.touches[0]
    startRef.current = event.target.closest?.("[data-no-swipe]")
      ? null
      : { x: touch.clientX, y: touch.clientY }
  }

  const onTouchEnd = (event) => {
    const start = startRef.current
    startRef.current = null
    if (!start) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * HORIZONTAL_RATIO) return
    if (dx < 0) onNext()
    else onPrev()
  }

  return { onTouchStart, onTouchEnd }
}
