// 입력 줄 올리기 값(px): 요소 아래 끝이 보이는 칸(visualViewport) 아래로 가려진 만큼
// Composer가 씀, 바닥 자리·채팅 칸 안 어디 있든 같은 식 (안드로이드는 화면이 이미 줄어 0)
import { useEffect, useRef, useState } from "react"

// enabled가 꺼지면 0 (크게 보기 시트는 시트가 직접 비킴)
export function useKeyboardLift(elementRef, enabled = true) {
    const [lift, setLift] = useState(0)
    const liftRef = useRef(0)

    useEffect(() => {
        const viewport = window.visualViewport
        if (!enabled || !viewport) return undefined

        // 지금 올린 값을 빼서 원래 자리 아래 끝으로 계산 (올린 뒤 다시 재도 흔들리지 않게)
        const sync = () => {
            const el = elementRef.current
            if (!el) return
            const baseBottom = el.getBoundingClientRect().bottom + liftRef.current
            const visibleBottom = viewport.offsetTop + viewport.height
            const next = Math.max(0, Math.round(baseBottom - visibleBottom))
            liftRef.current = next
            setLift(next)
        }

        sync()
        viewport.addEventListener("resize", sync)
        viewport.addEventListener("scroll", sync)
        return () => {
            viewport.removeEventListener("resize", sync)
            viewport.removeEventListener("scroll", sync)
            liftRef.current = 0
            setLift(0)
        }
    }, [elementRef, enabled])

    return lift
}
