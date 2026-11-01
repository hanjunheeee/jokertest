// 화면 위 줄·진행 바 아래 끝 높이(px): 재판 연출이 그 아래부터 그려지게 잼
// TribunalOverlay가 씀, 데스크톱 재판 연출도 위 줄·진행 바는 가리지 않아서 같게 맞춤
import { useLayoutEffect, useState } from "react"

// 화면 틀(InGamePage)의 위 줄·진행 바 칸 (입력 중 접힌 칸은 높이 0이라 빠짐)
const HUD_SELECTOR = '[data-slot="top"], [data-slot="timebar"]'

// 보이는 칸들의 아래 끝 중 가장 큰 값, 칸이 없으면(미리보기 화면) 0
function measure() {
    let bottom = 0
    for (const el of document.querySelectorAll(HUD_SELECTOR)) {
        const rect = el.getBoundingClientRect()
        if (rect.height > 0) bottom = Math.max(bottom, rect.bottom)
    }
    return Math.round(bottom)
}

// 칸 크기·화면 크기 바뀔 때마다 다시 잼
export function useHudInset() {
    const [inset, setInset] = useState(measure)

    useLayoutEffect(() => {
        const sync = () => setInset(measure())
        sync()
        const observer = new ResizeObserver(sync)
        document.querySelectorAll(HUD_SELECTOR).forEach((el) => observer.observe(el))
        window.addEventListener("resize", sync)
        return () => {
            observer.disconnect()
            window.removeEventListener("resize", sync)
        }
    }, [])

    return inset
}
