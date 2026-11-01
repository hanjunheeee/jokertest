// 길게 누르기: 손가락을 0.45초 대고 있으면 실행, 뒤따르는 탭은 무시
// CardSlot이 내 카드 이모티콘 팔레트 열기에 씀 (데스크톱 우클릭 대신)
import { useCallback, useEffect, useRef } from "react"

const HOLD_MS = 450
// 이만큼 움직이면 스크롤로 보고 취소
const MOVE_TOLERANCE_PX = 10

// onLongPress가 없으면 아무것도 안 함, 탭 처리 쪽은 shouldSkipClick으로 막힘 확인
export function useLongPress(onLongPress) {
    const timerRef = useRef(null)
    const startRef = useRef(null)
    const firedRef = useRef(false)
    const callbackRef = useRef(onLongPress)

    useEffect(() => {
        callbackRef.current = onLongPress
    }, [onLongPress])

    // 타이머 지우기
    const clear = useCallback(() => {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current)
        timerRef.current = null
        startRef.current = null
    }, [])

    useEffect(() => clear, [clear])

    // 누르기 시작: 왼쪽 버튼·손가락만, 시간 지나면 실행하고 다음 탭 무시 표시
    const onPointerDown = useCallback((event) => {
        firedRef.current = false
        if (typeof callbackRef.current !== "function") return
        if (event.pointerType === "mouse" && event.button !== 0) return
        startRef.current = { x: event.clientX, y: event.clientY }
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null
            firedRef.current = true
            callbackRef.current?.()
        }, HOLD_MS)
    }, [])

    // 많이 움직이면 취소
    const onPointerMove = useCallback((event) => {
        const start = startRef.current
        if (!start) return
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE_PX) clear()
    }, [clear])

    // 길게 누르기가 실행된 뒤의 탭인지 (한 번 확인하면 표시 지움)
    const shouldSkipClick = useCallback(() => {
        if (!firedRef.current) return false
        firedRef.current = false
        return true
    }, [])

    return {
        handlers: { onPointerDown, onPointerMove, onPointerUp: clear, onPointerCancel: clear, onPointerLeave: clear },
        shouldSkipClick,
    }
}
