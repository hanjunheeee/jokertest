// 화면 키보드에 가려지는 아래쪽 높이(px): visualViewport로 잼
// 입력 줄(Composer)이 씀, 안드로이드는 viewport 메타(resizes-content)로 이미 줄어 0, iOS는 이 값만큼 올림
import { useEffect, useState } from "react"

// 레이아웃 높이 - 보이는 높이 - 보이는 칸 위쪽 밀림 = 키보드가 덮은 높이
function measureInset() {
    const viewport = window.visualViewport
    if (!viewport) return 0
    const layoutHeight = document.documentElement.clientHeight
    const covered = layoutHeight - (viewport.height + viewport.offsetTop)
    // 주소창 들썩임 같은 작은 차이는 무시
    return covered > 1 ? Math.round(covered) : 0
}

// 크기·밀림 바뀔 때마다 다시 잼
export function useKeyboardInset() {
    const [inset, setInset] = useState(0)

    useEffect(() => {
        const viewport = window.visualViewport
        if (!viewport) return undefined

        const sync = () => setInset(measureInset())
        sync()
        viewport.addEventListener("resize", sync)
        viewport.addEventListener("scroll", sync)
        return () => {
            viewport.removeEventListener("resize", sync)
            viewport.removeEventListener("scroll", sync)
        }
    }, [])

    return inset
}
