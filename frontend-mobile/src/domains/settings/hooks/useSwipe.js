// 옆으로 쓸기 판단 (왼쪽·오른쪽 한 번씩)
// tutorial/TutorialSheet.jsx가 슬라이드 넘기기에 씀
import { useRef } from "react"

// 이만큼 옆으로 움직이고, 세로보다 커야 쓸기로 봄
const SWIPE_MIN_PX = 40

// 떼는 순간 한 번만 판단 (끌면서 따라오는 움직임은 없음)
export function useSwipe({ onLeft, onRight }) {
    const startRef = useRef(null)

    const onPointerDown = (event) => {
        startRef.current = { x: event.clientX, y: event.clientY }
    }

    const onPointerUp = (event) => {
        const start = startRef.current
        startRef.current = null
        if (!start) return
        const dx = event.clientX - start.x
        const dy = event.clientY - start.y
        if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return
        if (dx < 0) onLeft()
        else onRight()
    }

    const onPointerCancel = () => {
        startRef.current = null
    }

    return { onPointerDown, onPointerUp, onPointerCancel }
}
