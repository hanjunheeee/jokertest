// 넓은 배치(폰 가로·태블릿)인지: 입력 줄을 채팅 칸 안에 둘지 바닥 자리에 둘지 고름
// ChatPanel이 씀, 기준은 index.css의 land:·md: 와 같음
import { useSyncExternalStore } from "react"

const WIDE_QUERY = "(orientation: landscape) and (max-height: 540px) and (min-width: 560px), (min-width: 48rem)"

// matchMedia 구독 (바뀌면 다시 그림)
function subscribe(onChange) {
    const query = window.matchMedia(WIDE_QUERY)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
}

function getSnapshot() {
    return window.matchMedia(WIDE_QUERY).matches
}

export function useWideChat() {
    return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
